import OpenAI from "openai";
import { bmadService } from "@/lib/bmad";
import { configService } from "@/lib/config";
import { n8nClient } from "@/lib/n8n";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const { messages, agentId } = await req.json();

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
        } else {
            workflowContext = "\n## AUCUN WORKFLOW N8N TROUVÉ\nVérifiez la configuration N8N_API_URL et N8N_API_KEY dans les paramètres.\n";
        }
    } catch (error) {
        console.error("Failed to fetch n8n workflows:", error);
        workflowContext = "\n## ⚠️ IMPOSSIBLE DE RÉCUPÉRER LES WORKFLOWS N8N\nErreur de connexion à l'API n8n. Vérifiez la configuration.\n";
    }

    let systemPrompt = `Tu es n8n-orchestrator, un assistant IA dédié à aider les utilisateurs à créer et gérer des workflows n8n.
Tu as accès aux définitions de l'API n8n et tu peux générer des workflows JSON.
Tu réponds TOUJOURS en français.
Utilise le Markdown pour formater tes réponses.
Si l'utilisateur demande de créer un workflow, fournis le code JSON dans un bloc de code.

${workflowContext}

Tu peux référencer ces workflows par leur nom ou ID lorsque l'utilisateur pose des questions.`;

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


