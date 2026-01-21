import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { bmadService } from "@/lib/bmad";
import { configService } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const { messages, agentId } = await req.json();

    // Load Dynamic Config
    const apiKey = await configService.get("AI_API_KEY") || process.env.AI_API_KEY || "ollama";
    const baseURL = await configService.get("AI_BASE_URL") || process.env.AI_BASE_URL || "http://host.docker.internal:11434/v1";
    const modelName = await configService.get("AI_MODEL") || process.env.AI_MODEL || "llama3";

    const openai = createOpenAI({
        apiKey,
        baseURL,
        headers: {
            "HTTP-Referer": "https://github.com/R0m1k3/n8ngest",
            "X-Title": "n8n Orchestrator",
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

    const model = openai(modelName);

    const coreMessages = (messages as any[]).map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content as string,
    }));

    const result = await streamText({
        model,
        system: systemPrompt,
        messages: coreMessages,
        temperature: 0.7,
    });

    return result.toTextStreamResponse();
}
