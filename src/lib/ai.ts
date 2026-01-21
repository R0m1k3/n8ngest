import OpenAI from "openai";

export const aiClient = new OpenAI({
    apiKey: process.env.AI_API_KEY || "ollama", // Default to dummy key for Ollama
    baseURL: process.env.AI_BASE_URL || "http://host.docker.internal:11434/v1", // Default to local Ollama
});

export const AI_MODEL = process.env.AI_MODEL || "llama3";

export async function generateWorkflowPlan(prompt: string, context?: string) {
    const systemPrompt = `You are an expert n8n workflow architect.
  Your goal is to help users design and create n8n workflows.
  
  CONTEXT:
  ${context || "No specific context provided."}
  
  RESPONSE FORMAT:
  Return a valid JSON structure representing the plan or the n8n workflow nodes if explicitly asked.
  `;

    const response = await aiClient.chat.completions.create({
        model: AI_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
        ],
        temperature: 0.2, // Low temperature for code generation
    });

    return response.choices[0].message.content;
}
