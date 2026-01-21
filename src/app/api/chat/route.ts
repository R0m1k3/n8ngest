import OpenAI from "openai";
import { bmadService } from "@/lib/bmad";
import { configService } from "@/lib/config";

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

    let systemPrompt = `You are n8n-orchestrator, an AI assistant dedicated to helping users build and manage n8n workflows.
You have access to n8n API definitions and can generate JSON workflows.
Always answer in Markdown.
If the user asks to create a workflow, provide the JSON code block.`;

    if (agentId) {
        const agent = await bmadService.getAgent(agentId);
        if (agent) {
            console.log(`Injecting Agent Persona: ${agent.name}`);
            systemPrompt = `
--- BMAD AGENT ACTIVATION ---
NAME: ${agent.name}
DESCRIPTION: ${agent.description}

INSTRUCTIONS/PERSONA:
${agent.content}

--- END AGENT DEFINITION ---

You must embody this agent.
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

