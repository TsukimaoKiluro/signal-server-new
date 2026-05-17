// src/server/index.ts

export interface Env {
	Chat: DurableObjectNamespace;
	LOG_KV: KVNamespace;  // 用于存储日志
}

// ----- Worker 入口 -----
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 新增：HTTP API 获取日志
		if (url.pathname === '/api/logs') {
			const limit = parseInt(url.searchParams.get('limit') || '100');
			const list = await env.LOG_KV.list({ prefix: 'log:', limit });
			const keys = list.keys.sort((a, b) => b.name.localeCompare(a.name));
			const logs = [];
			for (const key of keys) {
				const value = await env.LOG_KV.get(key.name);
				if (value) logs.push(JSON.parse(value));
			}
			return Response.json({ logs });
		}

		// WebSocket 升级请求
		const roomId = url.searchParams.get('roomId');
		if (!roomId || request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket upgrade with roomId", { status: 400 });
		}

		// 获取 Durable Object 实例
		const id = env.Chat.idFromName(roomId);
		const stub = env.Chat.get(id);
		return stub.fetch(request);
	}
};

// ----- Durable Object：管理一个房间的信令 -----
export class Chat implements DurableObject {
	private sessions: Map<string, WebSocket> = new Map();

	constructor(private state: DurableObjectState, private env: Env) {}

	// 写入日志到 KV
	private async writeLog(level: string, event: string, details: any) {
		const timestamp = Date.now();
		const key = `log:${timestamp}`;
		const logEntry = {
			timestamp,
			level,
			event,
			roomId: this.state.id.toString(),
			...details
		};
		await this.env.LOG_KV.put(key, JSON.stringify(logEntry), { expirationTtl: 86400 * 7 });
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const clientId = url.searchParams.get('clientId') || crypto.randomUUID();

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 400 });
		}

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		// 使用 Hibernation API
		this.state.acceptWebSocket(server);
		this.sessions.set(clientId, server);
		server.serializeAttachment(clientId);

		await this.writeLog('info', 'connect', { clientId });
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const clientId = ws.deserializeAttachment();
		try {
			const signal = JSON.parse(message as string);
			const targetId = signal.to;
			await this.writeLog('info', 'message', { clientId, targetId, type: signal.type });

			if (targetId && this.sessions.has(targetId)) {
				const targetWs = this.sessions.get(targetId);
				if (targetWs && targetWs.readyState === WebSocket.OPEN) {
					targetWs.send(JSON.stringify({ from: clientId, ...signal }));
				}
			} else {
				// 没有目标则回显
				ws.send(JSON.stringify({ type: 'echo', data: signal, from: 'server' }));
			}
		} catch (e) {
			await this.writeLog('error', 'error', { clientId, error: String(e) });
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		const clientId = ws.deserializeAttachment();
		if (clientId) {
			this.sessions.delete(clientId);
			await this.writeLog('info', 'close', { clientId, code, reason });
		}
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		const clientId = ws.deserializeAttachment();
		if (clientId) {
			this.sessions.delete(clientId);
			await this.writeLog('error', 'error', { clientId, error: String(error) });
		}
	}
}