"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Bot, Settings, Menu, X } from "lucide-react";
import Link from "next/link";
import ChatSidebar from "@/components/ChatSidebar";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Session State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

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

  // Load Session History
  const loadSession = async (id: string) => {
    setIsLoading(true);
    setSessionId(id);
    setMessages([]); // Clear previous messages immediately
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Convert DB messages to UI messages
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content
          })));
        }
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
  };

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
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
          sessionId: sessionId // Send current session ID if exists
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Capture new Session ID from header if it was created
      const newSessionId = response.headers.get("X-Chat-Session-Id");
      if (newSessionId && !sessionId) {
        setSessionId(newSessionId);
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
              if (commandJson.workflowId || result.workflow?.id) {
                const targetId = commandJson.workflowId || result.workflow?.id;
                const verifyResponse = await fetch(`/api/n8n/workflows/${targetId}`);
                if (verifyResponse.ok) {
                  const updatedWorkflow = await verifyResponse.json();

                  // Check if specific nodes were modified
                  const changedNodes = commandJson.changes?.nodes || commandJson.data?.nodes || [];
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
  }, [messages, selectedAgent, sessionId]); // Dependencies for callback

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">

      {/* Sidebar Toggle (Mobile) */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="fixed top-4 left-4 z-50 p-2 bg-slate-800 rounded-md md:hidden"
      >
        {showSidebar ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar Area */}
      <div className={`${showSidebar ? 'block' : 'hidden'} md:block h-full`}>
        <ChatSidebar
          currentSessionId={sessionId}
          onSessionSelect={loadSession}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative w-full">

        {/* Top Bar for Agent Selection (moved from sidebar) */}
        {!sessionId && messages.length === 0 && (
          <div className="absolute top-4 right-4 z-10">
            <select
              className="bg-slate-800 border border-slate-700 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
            <Link
              href="/settings"
              className="ml-2 inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm p-2 rounded-md hover:bg-slate-800"
            >
              <Settings size={16} />
            </Link>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
              <Bot size={48} className="opacity-20" />
              <p>Sélectionnez un agent ou commencez à discuter pour gérer vos workflows n8n.</p>
              <p className="text-xs text-slate-600">Les discussions sont sauvegardées automatiquement.</p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
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
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
        />
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none p-4 pb-1 text-center">
          <p className="text-xs text-slate-500">
            Powered by OpenRouter & n8n API • {messages.length > 0 ? `${messages.length} messages` : "Ready"}
          </p>
        </div>
      </div>
    </div>
  );
}

