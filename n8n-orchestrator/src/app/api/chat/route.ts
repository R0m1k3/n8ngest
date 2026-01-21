import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { bmadService } from "@/lib/bmad";

export const runtime = "nodejs";

const openai = createOpenAI({
    apiKey: process.env.AI_API_KEY || "ollama",
    baseURL: process.env.AI_BASE_URL || "http://host.docker.internal:11434/v1",
});

export async function POST(req: Request) {
    const { messages, agentId } = await req.json();

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

    const model = openai(process.env.AI_MODEL || "llama3");

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
