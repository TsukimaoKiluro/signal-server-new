// src/client/Logs.tsx
import React, { useState, useEffect } from 'react';

interface LogEntry {
    timestamp: number;
    level: string;
    event: string;
    roomId: string;
    clientId?: string;
    targetId?: string;
    type?: string;
    code?: number;
    reason?: string;
    error?: string;
}

export default function Logs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
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
            <table border={1} cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
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