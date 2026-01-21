"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { Bot, User, Send, Settings, Check, Copy } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

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

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || "");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative group rounded-md overflow-hidden my-4">
        <div className="flex items-center justify-between bg-zinc-700 px-4 py-2 text-xs text-zinc-200">
          <span className="font-mono">{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-400" /> Copié
              </>
            ) : (
              <>
                <Copy size={14} /> Copier
              </>
            )}
          </button>
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: "0 0 0.375rem 0.375rem" }}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={classNames("bg-slate-800 rounded px-1 py-0.5", className)} {...props}>
      {children}
    </code>
  );
};

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
      <div className="flex-1 flex flex-col relative">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <Bot size={48} className="opacity-20" />
              <p>Sélectionnez un agent ou commencez à discuter pour gérer vos workflows n8n.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={classNames(
                  "flex gap-4 p-4 rounded-lg max-w-3xl",
                  message.role === "assistant" ? "bg-slate-900 mx-auto" : "bg-slate-800 ml-auto"
                )}
              >
                <div className="flex-shrink-0 mt-1">
                  {message.role === "assistant" ? (
                    <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                      <Bot size={20} className="text-white" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center">
                      <User size={20} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 prose prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: CodeBlock,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-4 p-4 rounded-lg max-w-3xl mx-auto bg-slate-900">
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center animate-pulse">
                <Bot size={20} className="text-white" />
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              </div>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-900/50 border border-red-800 text-red-200 rounded-lg max-w-3xl mx-auto">
              Error: {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Décrivez le workflow que vous souhaitez créer ou modifier..."
              className="w-full bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl pr-12 py-4 shadow-lg focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-xs text-slate-500">
              Powered by OpenRouter & n8n API • {messages.length > 0 ? `${messages.length} messages` : "Ready"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

