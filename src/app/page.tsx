"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { Bot, User, Send, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

interface Agent {
  id: string;
  name: string;
  description: string;
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => {
        if (data.agents) {
          setAgents(data.agents);
        }
      });
  }, []);

  // Force cast options and return to avoid build errors with mismatched SDK versions
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    body: {
      agentId: selectedAgent,
    },
  } as any) as any;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
            <span className="font-bold text-white">n8n</span>
          </div>
          <h1 className="font-bold text-lg tracking-tight">Orchestrator</h1>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase">Agent Persona</label>
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            <option value="">Default Assistant</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          {selectedAgent && (
            <p className="text-xs text-slate-400 mt-1">
              {agents.find(a => a.id === selectedAgent)?.description.slice(0, 100)}...
            </p>
          )}
        </div>

        <div className="mt-auto">
          <Link href="/settings" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm w-full p-2 rounded-md hover:bg-slate-800">
            <Settings size={16} /> Configuration
          </Link>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Bot size={48} className="mb-4 text-slate-700" />
              <p className="text-lg font-medium">Ready to orchestrate.</p>
              <p className="text-sm">Select an agent or start typing to create a workflow.</p>
            </div>
          )}

          {(messages as any[]).map((m: any) => (
            <div
              key={m.id}
              className={classNames(
                "flex gap-4 max-w-4xl mx-auto",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={classNames(
                  "p-4 rounded-xl max-w-[80%] shadow-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-orange-600 text-white rounded-br-none"
                    : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none"
                )}
              >
                <div className="flex items-center gap-2 mb-2 opacity-50 text-xs uppercase font-bold tracking-wider">
                  {m.role === "user" ? <User size={12} /> : <Bot size={12} />}
                  {m.role === "user" ? "You" : selectedAgent || "System"}
                </div>
                {m.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl rounded-bl-none animate-pulse">
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce delay-75"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce delay-150"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <form
            onSubmit={handleSubmit}
            className="max-w-4xl mx-auto flex gap-4 relative"
          >
            <input
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-slate-600"
              value={input}
              onChange={handleInputChange}

              placeholder="Describe a workflow to create..."
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-orange-600 hover:bg-orange-500 text-white rounded-md flex items-center justify-center transition-all disabled:opacity-50 disabled:hover:bg-orange-600"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-slate-600">
              Powered by n8n Orchestrator • AI Model: {process.env.NEXT_PUBLIC_AI_MODEL || 'Auto'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
