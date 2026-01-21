import OpenAI from "openai";
import { bmadService } from "@/lib/bmad";
import { configService } from "@/lib/config";
import { n8nClient } from "@/lib/n8n";
import { N8nWorkflow } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Extract potential workflow names from user message
 */
function extractWorkflowMention(message: string): string | null {
    // Look for workflow names in quotes
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) return quotedMatch[1];

    // Look for "workflow" followed by a name
    const workflowMatch = message.match(/workflow\s+([A-Za-z0-9_\-\s]+)/i);
    if (workflowMatch) return workflowMatch[1].trim();

    return null;
}

/**
 * Format workflow nodes for AI context
 */
function formatWorkflowDetails(workflow: N8nWorkflow): string {
    const nodesInfo = workflow.nodes.map(node => {
        const params = node.parameters ? JSON.stringify(node.parameters, null, 2) : "{}";
        return `### Node: ${node.name} (Type: ${node.type})
Position: [${node.position?.[0] || 0}, ${node.position?.[1] || 0}]
\`\`\`json
${params}
\`\`\``;
    }).join("\n\n");

    return `
## 📋 DÉTAILS DU WORKFLOW: ${workflow.name}
- **ID**: ${workflow.id}
- **Statut**: ${workflow.active ? "✅ Actif" : "❌ Inactif"}
- **Nombre de nodes**: ${workflow.nodes.length}

### NODES:
${nodesInfo}

### CONNECTIONS:
\`\`\`json
${JSON.stringify(workflow.connections, null, 2)}
\`\`\`
`;
}

/**
 * Format execution history for AI context
 */
function formatExecutionHistory(executions: any[]): string {
    if (!executions || executions.length === 0) {
        return "\n## 📊 HISTORIQUE DES EXÉCUTIONS: Aucune exécution récente\n";
    }

    const executionsInfo = executions.slice(0, 5).map((exec, i) => {
        const status = exec.finished ? (exec.status === "error" ? "❌ Échec" : "✅ Succès") : "⏳ En cours";
        const startTime = new Date(exec.startedAt).toLocaleString("fr-FR");
        const duration = exec.stoppedAt
            ? `${((new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000).toFixed(1)}s`
            : "N/A";

        // Extract error info if available
        let errorInfo = "";
        if (exec.data?.resultData?.error) {
            const error = exec.data.resultData.error;
            errorInfo = `\n   **Erreur**: ${error.message || JSON.stringify(error)}`;
        }

        // Extract node outputs summary
        let nodeOutputs = "";
        if (exec.data?.resultData?.runData) {
            const runData = exec.data.resultData.runData;
            const nodeNames = Object.keys(runData).slice(0, 5);
            nodeOutputs = nodeNames.map(name => {
                const nodeData = runData[name];
                if (Array.isArray(nodeData) && nodeData[0]?.data?.main) {
                    const outputCount = nodeData[0].data.main[0]?.length || 0;
                    return `   - **${name}**: ${outputCount} item(s)`;
                }
                return `   - **${name}**: exécuté`;
            }).join("\n");
        }

        return `
### Exécution #${i + 1} (ID: ${exec.id})
- **Statut**: ${status}
- **Démarré**: ${startTime}
- **Durée**: ${duration}${errorInfo}
${nodeOutputs ? `\n**Données par node:**\n${nodeOutputs}` : ""}`;
    }).join("\n");

    return `
## 📊 HISTORIQUE DES ${executions.length} DERNIÈRES EXÉCUTIONS:
${executionsInfo}
`;
}


import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const { messages, agentId, workflowAction, sessionId: requestedSessionId } = await req.json();

    // 1. Handle session management first
    let sessionId = requestedSessionId;
    let isNewSession = false;

    if (!sessionId) {
        // Create new session
        const title = messages[messages.length - 1]?.content.slice(0, 50) + "..." || "Nouvelle discussion";
        try {
            const session = await prisma.chatSession.create({
                data: { title }
            });
            sessionId = session.id;
            isNewSession = true;
        } catch (e) {
            console.error("Failed to create session:", e);
        }
    }

    // 2. Save User Message
    const lastMessage = messages[messages.length - 1];
    if (sessionId && lastMessage && lastMessage.role === 'user') {
        try {
            await prisma.chatMessage.create({
                data: {
                    role: 'user',
                    content: lastMessage.content,
                    sessionId: sessionId
                }
            });
            // Update session timestamp
            await prisma.chatSession.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() }
            });
        } catch (e) {
            console.error("Failed to save user message:", e);
        }
    }

    // Handle workflow actions from AI commands
    if (workflowAction) {
        try {
            const { action, workflowId, data } = workflowAction;
            let result: any;

            if (action === "update" && workflowId && data) {
                const updated = await n8nClient.updateWorkflow(workflowId, data);
                result = { success: true, workflow: updated };
            } else if (action === "execute" && workflowId) {
                const execution = await n8nClient.executeWorkflow(workflowId);
                result = { success: true, execution };
            } else {
                throw new Error("Action inconnue ou non supportée.");
            }

            // Save Tool/Assistant response if needed (optional for tool outputs, but good for history)
            // For now, we rely on the AI's interpretation of the result in the next turn,
            // or we could save a system/tool message. Let's start strictly with chat roles.

            return new Response(JSON.stringify(result), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return new Response(JSON.stringify({ success: false, error: message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // Load Dynamic Config
    const apiKey = await configService.get("AI_API_KEY") || process.env.AI_API_KEY;
    const modelName = await configService.get("AI_MODEL") || process.env.AI_MODEL || "anthropic/claude-3-sonnet";

    if (!apiKey) {
        return new Response("OpenRouter API key not configured", { status: 500 });
    }

    // OpenRouter compatible client
    const client = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            "X-Title": "n8n AI Orchestrator",
        }
    });

    // Fetch real n8n workflows to provide context
    let workflowContext = "";
    try {
        const workflows = await n8nClient.getWorkflows();
        if (workflows && workflows.length > 0) {
            workflowContext = `
## WORKFLOWS N8N DISPONIBLES (${workflows.length} total):
${workflows.map(w => `- **${w.name}** (ID: ${w.id}) - ${w.active ? "✅ Actif" : "❌ Inactif"}`).join("\n")}
`;
            // Check if user mentioned a specific workflow in their last message
            const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
            if (lastUserMessage) {
                const mentionedWorkflow = extractWorkflowMention(lastUserMessage.content);
                if (mentionedWorkflow) {
                    // Try to find matching workflow
                    const found = await n8nClient.findWorkflowByName(mentionedWorkflow);
                    if (found) {
                        const detailedWorkflow = await n8nClient.getWorkflow(found.id);
                        workflowContext += "\n" + formatWorkflowDetails(detailedWorkflow);

                        // Load execution history
                        try {
                            const executions = await n8nClient.getExecutions(found.id, 5);
                            workflowContext += "\n" + formatExecutionHistory(executions);
                        } catch (execError) {
                            console.log("Failed to fetch executions:", execError);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Failed to fetch n8n workflows:", error);
    }

    // ... (System Prompt logic reuse)
    // We recreate the prompt here to ensure it's fresh
    let systemPrompt = `Tu es n8n-orchestrator, un assistant IA expert en workflows n8n.
Tu as accès aux définitions de l'API n8n et tu peux analyser, modifier et exécuter des workflows.
Tu réponds TOUJOURS en français.
Utilise le Markdown pour formater tes réponses.

## RÈGLES STRICTES:
1. NE DIS JAMAIS "je vais investiguer" sans résultat.
2. MONTRE TOUJOURS les données.
3. SOIS CONCRET : noms de nodes, paramètres exacts.
4. Si un workflow est chargé, ANALYSE-LE.

## COMMANDES SPÉCIALES:
Action "update" (JSON strict):
\`\`\`n8n-command
{
  "action": "update",
  "workflowId": "<ID>",
  "changes": { "nodes": [...], "connections": {...} }
}
\`\`\`

Action "execute":
\`\`\`n8n-command
{ "action": "execute", "workflowId": "<ID>" }
\`\`\`

${workflowContext}`;

    if (agentId) {
        const agent = await bmadService.getAgent(agentId);
        if (agent) {
            systemPrompt = `
--- ACTIVATION AGENT BMAD ---
NOM: ${agent.name}
DESCRIPTION: ${agent.description}

INSTRUCTIONS/PERSONA:
${agent.content}

--- FIN DÉFINITION AGENT ---

Tu dois incarner cet agent. Tu réponds TOUJOURS en français.
Tu as accès aux workflows n8n.

${workflowContext}
`;
        }
    }

    const coreMessages = (messages as any[]).map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content as string,
    }));

    try {
        const stream = await client.chat.completions.create({
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                ...coreMessages,
            ],
            temperature: 0.7,
            stream: true,
        });

        const encoder = new TextEncoder();
        let assistantContent = "";

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            assistantContent += content;
                            controller.enqueue(encoder.encode(content));
                        }
                    }

                    // SAVE ASSISTANT MESSAGE ON COMPLETION
                    if (sessionId && assistantContent) {
                        try {
                            await prisma.chatMessage.create({
                                data: {
                                    role: 'assistant',
                                    content: assistantContent,
                                    sessionId: sessionId
                                }
                            });
                        } catch (e) {
                            console.error("Failed to save assistant message:", e);
                        }
                    }

                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });

        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
                "X-Chat-Session-Id": sessionId || ""
            },
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        return new Response(`Error: ${error instanceof Error ? error.message : "Unknown"}`, { status: 500 });
    }
}



