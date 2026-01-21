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

export async function POST(req: Request) {
    const { messages, agentId, workflowAction } = await req.json();

    // Handle workflow actions from AI commands
    if (workflowAction) {
        try {
            const { action, workflowId, data } = workflowAction;
            if (action === "update" && workflowId && data) {
                const updated = await n8nClient.updateWorkflow(workflowId, data);
                return new Response(JSON.stringify({ success: true, workflow: updated }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            if (action === "execute" && workflowId) {
                const execution = await n8nClient.executeWorkflow(workflowId);
                return new Response(JSON.stringify({ success: true, execution }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
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
    let detailedWorkflow: N8nWorkflow | null = null;

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
                        // Load full details
                        detailedWorkflow = await n8nClient.getWorkflow(found.id);
                        workflowContext += "\n" + formatWorkflowDetails(detailedWorkflow);
                    }
                }
            }
        } else {
            workflowContext = "\n## AUCUN WORKFLOW N8N TROUVÉ\nVérifiez la configuration N8N_API_URL et N8N_API_KEY dans les paramètres.\n";
        }
    } catch (error) {
        console.error("Failed to fetch n8n workflows:", error);
        workflowContext = "\n## ⚠️ IMPOSSIBLE DE RÉCUPÉRER LES WORKFLOWS N8N\nErreur de connexion à l'API n8n. Vérifiez la configuration.\n";
    }

    let systemPrompt = `Tu es n8n-orchestrator, un assistant IA expert en workflows n8n.
Tu as accès aux définitions de l'API n8n et tu peux analyser, modifier et exécuter des workflows.
Tu réponds TOUJOURS en français.
Utilise le Markdown pour formater tes réponses.

## RÈGLES STRICTES:
1. **NE DIS JAMAIS** "je vais investiguer" ou "laissez-moi regarder" sans fournir de résultat immédiat.
2. **MONTRE TOUJOURS** les données que tu reçois. Si tu as les détails d'un workflow, affiche-les.
3. **SOIS CONCRET** : donne des noms de nodes, des valeurs de paramètres, des corrections précises.
4. **AGIS, NE DÉCRIS PAS** : au lieu de dire "vous devriez vérifier...", montre directement ce que tu vois.
5. Si un workflow est chargé ci-dessous, **ANALYSE-LE IMMÉDIATEMENT** dans ta réponse.

## CAPACITÉS:
1. **Lister** les workflows disponibles
2. **Analyser** un workflow en détail (nodes, connexions, paramètres)
3. **Diagnostiquer** les problèmes de configuration
4. **Proposer des corrections** spécifiques avec le code exact
5. **Appliquer les corrections** directement si l'utilisateur le demande

## FORMAT DE RÉPONSE QUAND UN WORKFLOW EST MENTIONNÉ:
1. **Résumé** : Nom du workflow, nombre de nodes, statut
2. **Nodes clés** : Liste des nodes importants avec leurs types
3. **Analyse** : Problèmes potentiels identifiés
4. **Solution** : Correction proposée avec le code ou paramètre exact

## COMMANDES SPÉCIALES:
Quand tu veux modifier un workflow, utilise ce format JSON dans un bloc de code:
\`\`\`n8n-command
{
  "action": "update",
  "workflowId": "<ID>",
  "changes": {
    "nodes": [...],
    "connections": {...}
  }
}
\`\`\`

Pour exécuter un workflow:
\`\`\`n8n-command
{
  "action": "execute",
  "workflowId": "<ID>"
}
\`\`\`

${workflowContext}

Tu peux référencer ces workflows par leur nom ou ID. Quand l'utilisateur mentionne un workflow spécifique, ses détails complets sont chargés automatiquement ci-dessus. UTILISE CES DONNÉES dans ta réponse.`;

    if (agentId) {
        const agent = await bmadService.getAgent(agentId);
        if (agent) {
            console.log(`Injecting Agent Persona: ${agent.name}`);
            systemPrompt = `
--- ACTIVATION AGENT BMAD ---
NOM: ${agent.name}
DESCRIPTION: ${agent.description}

INSTRUCTIONS/PERSONA:
${agent.content}

--- FIN DÉFINITION AGENT ---

Tu dois incarner cet agent. Tu réponds TOUJOURS en français.
Tu as accès aux workflows n8n et peux les analyser/modifier.

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

        // Create a ReadableStream from the OpenAI stream
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(encoder.encode(content));
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
            },
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(`Error: ${message}`, { status: 500 });
    }
}



