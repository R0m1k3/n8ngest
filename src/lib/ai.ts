import OpenAI from "openai";
import { configService } from "./config";

// Helper to get dynamic client
export async function getAiClient() {
    const apiKey = await configService.get("AI_API_KEY") || process.env.AI_API_KEY || "ollama";
    const baseURL = await configService.get("AI_BASE_URL") || process.env.AI_BASE_URL || "http://host.docker.internal:11434/v1";

    return new OpenAI({
        apiKey,
        baseURL
    });
}

export async function getAiModel() {
    return await configService.get("AI_MODEL") || process.env.AI_MODEL || "llama3";
}

export async function generateWorkflowPlan(prompt: string, context?: string) {
    const client = await getAiClient();
    const model = await getAiModel();

    const systemPrompt = `You are an expert n8n workflow architect.
  Your goal is to help users design and create n8n workflows.
  
  CONTEXT:
  ${context || "No specific context provided."}
  
  RESPONSE FORMAT:
  Return a valid JSON structure representing the plan or the n8n workflow nodes if explicitly asked.
  `;

    const response = await client.chat.completions.create({
        model: model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
        ],
        temperature: 0.2, // Low temperature for code generation
    });

    return response.choices[0].message.content;
}
