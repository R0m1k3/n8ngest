"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Plus, Trash2, Calendar } from "lucide-react";
import Link from "next/link";

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
    _count?: {
        messages: number;
    };
}

interface ChatSidebarProps {
    currentSessionId: string | null;
    onSessionSelect: (sessionId: string) => void;
    onNewChat: () => void;
}

export default function ChatSidebar({
    currentSessionId,
    onSessionSelect,
    onNewChat,
}: ChatSidebarProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchSessions = async () => {
        try {
            const res = await fetch("/api/chat/sessions");
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (error) {
            console.error("Failed to fetch sessions", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [currentSessionId]); // Refresh when session changes (e.g. title update)

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Supprimer cette discussion ?")) return;

        try {
            await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
            setSessions(prev => prev.filter(s => s.id !== id));
            if (currentSessionId === id) {
                onNewChat();
            }
        } catch (error) {
            console.error("Failed to delete session", error);
        }
    };

    return (
        <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-800">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white p-2 rounded-md transition-colors text-sm font-medium"
                >
                    <Plus size={16} />
                    Nouvelle discussion
                </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoading ? (
                    <div className="text-center text-slate-500 text-xs py-4">Chargement...</div>
                ) : sessions.length === 0 ? (
                    <div className="text-center text-slate-500 text-xs py-4">Aucun historique</div>
                ) : (
                    sessions.map((session) => (
                        <div
                            key={session.id}
                            onClick={() => onSessionSelect(session.id)}
                            className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${currentSessionId === session.id
                                    ? "bg-slate-800 text-white border-l-2 border-orange-500"
                                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                }`}
                        >
                            <div className="flex-1 min-w-0 pr-2">
                                <p className="text-sm font-medium truncate">{session.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] opacity-60 flex items-center gap-1">
                                        <Calendar size={10} />
                                        {new Date(session.updatedAt).toLocaleDateString()}
                                    </span>
                                    {session._count && (
                                        <span className="text-[10px] bg-slate-700 px-1 rounded-full text-slate-300">
                                            {session._count.messages}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, session.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-all"
                                title="Supprimer"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            <div className="pl-4 pr-10 pb-4 text-xs text-slate-500">
                v1.0.1
            </div>
        </div>
    );
}
