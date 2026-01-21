"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { Bot, User, Send, Settings } from "lucide-react";
import Link from "next/link";

function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

interface Agent {
  id: string;
  name: string;
  description: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => {
        if (data.agents) {
          setAgents(data.agents);
        }
      });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agentId: selectedAgent,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      const assistantId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m
          )
        );
      }

      // Check for n8n-command blocks in the response and execute them
      const commandMatch = fullContent.match(/```n8n-command\s*([\s\S]*?)```/);
      if (commandMatch) {
        try {
          const commandJson = JSON.parse(commandMatch[1].trim());
          console.log("Executing n8n command:", commandJson);

          // Execute the command
          const actionResponse = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [],
              workflowAction: {
                action: commandJson.action,
                workflowId: commandJson.workflowId,
                data: commandJson.changes || commandJson.data,
              },
            }),
          });

          const result = await actionResponse.json();
          console.log("n8n command result:", result);

          // Add a system message about the result
          if (result.success) {
            // Verification step: Re-fetch the workflow to confirm changes
            let verificationMessage = `\n\n✅ **Commande n8n exécutée avec succès !**\n- Action: ${commandJson.action}\n- Workflow ID: ${commandJson.workflowId}`;

            try {
              const verifyResponse = await fetch(`/api/n8n/workflows/${commandJson.workflowId}`);
              if (verifyResponse.ok) {
                const updatedWorkflow = await verifyResponse.json();

                // Check if specific nodes were modified
                const changedNodes = commandJson.changes?.nodes || [];
                const verifiedNodes: string[] = [];

                for (const changedNode of changedNodes) {
                  const actualNode = updatedWorkflow.nodes?.find(
                    (n: any) => n.name === changedNode.name || n.id === changedNode.id
                  );
                  if (actualNode) {
                    verifiedNodes.push(`  - ✅ **${actualNode.name}** (${actualNode.type})`);
                  }
                }

                if (verifiedNodes.length > 0) {
                  verificationMessage += `\n\n🔍 **Vérification dans n8n :**\n${verifiedNodes.join("\n")}`;
                }

                verificationMessage += `\n\n📋 **État actuel du workflow :**\n- Nombre de nodes: ${updatedWorkflow.nodes?.length || 0}\n- Statut: ${updatedWorkflow.active ? "✅ Actif" : "❌ Inactif"}\n- Dernière modification: ${new Date(updatedWorkflow.updatedAt).toLocaleString("fr-FR")}`;
              }
            } catch (verifyError) {
              console.error("Verification failed:", verifyError);
              verificationMessage += `\n\n⚠️ Vérification impossible (workflow non accessible)`;
            }

            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 2).toString(),
                role: "assistant",
                content: verificationMessage,
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 2).toString(),
                role: "assistant",
                content: `\n\n❌ **Erreur lors de l'exécution de la commande n8n**\n${result.error || "Erreur inconnue"}`,
              },
            ]);
          }
        } catch (cmdError) {
          console.error("Failed to parse/execute n8n command:", cmdError);
        }
      }
    } catch (err) {
      console.error("Chat Error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

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
              {agents.find((a) => a.id === selectedAgent)?.description?.slice(0, 100)}...
            </p>
          )}
        </div>

        <div className="mt-auto">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm w-full p-2 rounded-md hover:bg-slate-800"
          >
            <Settings size={16} /> Configuration
          </Link>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {messages.length === 0 && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Bot size={48} className="mb-4 text-slate-700" />
              <p className="text-lg font-medium">Ready to orchestrate.</p>
              <p className="text-sm">Select an agent or start typing to create a workflow.</p>
            </div>
          )}

          {messages.map((m) => (
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
                  {m.role === "user" ? "You" : selectedAgent || "Assistant"}
                </div>
                {m.content || (isLoading && m.role === "assistant" ? "..." : "")}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl rounded-bl-none animate-pulse">
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce delay-75"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full inline-block mx-1 animate-bounce delay-150"></span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-900/50 border border-red-700 rounded-xl max-w-4xl mx-auto text-red-200">
              Error: {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-4 relative">
            <input
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-slate-600"
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
              Powered by n8n Orchestrator • OpenRouter AI
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

