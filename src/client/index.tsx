import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect } from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	Navigate,
	useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message } from "../shared";

// ---------- 新增日志组件 ----------
function LogsView() {
	const [logs, setLogs] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchLogs = async () => {
		try {
			const res = await fetch('/api/logs?limit=100');
			const data = await res.json();
			setLogs(data.logs || []);
		} catch (err) {
			console.error('Failed to fetch logs:', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchLogs();
		const interval = setInterval(fetchLogs, 3000);
		return () => clearInterval(interval);
	}, []);

	if (loading) return <div>Loading logs...</div>;

	return (
		<div style={{ padding: '20px', fontFamily: 'monospace' }}>
			<h2>信令服务器日志</h2>
			<table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
				<thead>
				<tr>
					<th>时间</th>
					<th>级别</th>
					<th>事件</th>
					<th>房间ID</th>
					<th>客户端ID</th>
					<th>详情</th>
				</tr>
				</thead>
				<tbody>
				{logs.map((log, idx) => (
					<tr key={idx}>
						<td>{new Date(log.timestamp).toLocaleString()}</td>
						<td style={{ color: log.level === 'error' ? 'red' : 'green' }}>{log.level}</td>
						<td>{log.event}</td>
						<td>{log.roomId}</td>
						<td>{log.clientId?.slice(-8)}</td>
						<td>
							{log.event === 'message' && `→ ${log.targetId?.slice(-8)} (${log.type})`}
							{log.event === 'close' && `code ${log.code}`}
							{log.event === 'error' && log.error}
						</td>
					</tr>
				))}
				</tbody>
			</table>
		</div>
	);
}
// ---------- 原有 App 组件 ----------
function App() {
	const [name] = useState(names[Math.floor(Math.random() * names.length)]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const { room } = useParams();

	const socket = usePartySocket({
		party: "chat",
		room,
		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as Message;
			if (message.type === "add") {
				const foundIndex = messages.findIndex((m) => m.id === message.id);
				if (foundIndex === -1) {
					setMessages((messages) => [
						...messages,
						{
							id: message.id,
							content: message.content,
							user: message.user,
							role: message.role,
						},
					]);
				} else {
					setMessages((messages) => {
						return messages
							.slice(0, foundIndex)
							.concat({
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							})
							.concat(messages.slice(foundIndex + 1));
					});
				}
			} else if (message.type === "update") {
				setMessages((messages) =>
					messages.map((m) =>
						m.id === message.id
							? {
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							}
							: m,
					),
				);
			} else {
				setMessages(message.messages);
			}
		},
	});

	return (
		<div className="chat container">
			{messages.map((message) => (
				<div key={message.id} className="row message">
					<div className="two columns user">{message.user}</div>
					<div className="ten columns">{message.content}</div>
				</div>
			))}
			<form
				className="row"
				onSubmit={(e) => {
					e.preventDefault();
					const content = e.currentTarget.elements.namedItem(
						"content",
					) as HTMLInputElement;
					const chatMessage: ChatMessage = {
						id: nanoid(8),
						content: content.value,
						user: name,
						role: "user",
					};
					setMessages((messages) => [...messages, chatMessage]);
					socket.send(
						JSON.stringify({
							type: "add",
							...chatMessage,
						} satisfies Message),
					);
					content.value = "";
				}}
			>
				<input
					type="text"
					name="content"
					className="ten columns my-input-text"
					placeholder={`Hello ${name}! Type a message...`}
					autoComplete="off"
				/>
				<button type="submit" className="send-message two columns">
					Send
				</button>
			</form>
		</div>
	);
}

// ---------- 渲染 ----------
createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<div>
			<nav style={{ padding: '10px', background: '#f0f0f0' }}>
				<a href="/" style={{ marginRight: '10px' }}>聊天室</a>
				<a href="/logs">日志查看</a>
			</nav>
			<Routes>
				<Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
				<Route path="/:room" element={<App />} />
				<Route path="/logs" element={<LogsView />} />
				<Route path="*" element={<Navigate to="/" />} />
			</Routes>
		</div>
	</BrowserRouter>,
);