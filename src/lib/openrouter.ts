import { configService } from "./config";

export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    pricing: {
        prompt: string;
        completion: string;
        request?: string;
        image?: string;
    };
    context_length: number;
    architecture?: {
        modality: string;
        tokenizer: string;
        instruct_type: string | null;
    };
    top_provider?: {
        context_length: number | null;
        max_completion_tokens: number | null;
        is_moderated: boolean;
    };
}

export class OpenRouterService {
    private static CACHE_TTL = 1000 * 60 * 60; // 1 hour
    private static cache: { timestamp: number; data: OpenRouterModel[] } | null = null;

    async getModels(): Promise<OpenRouterModel[]> {
        // Check cache
        if (
            OpenRouterService.cache &&
            Date.now() - OpenRouterService.cache.timestamp < OpenRouterService.CACHE_TTL
        ) {
            return OpenRouterService.cache.data;
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                headers: {
                    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                    "X-Title": "n8n AI Orchestrator",
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
            }

            const data = await response.json();

            // Sort models: prioritize "popular" models if possible, otherwise alphabetical
            // For now, strict alphabetical sort
            const models = (data.data as OpenRouterModel[]).sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            // Update cache
            OpenRouterService.cache = {
                timestamp: Date.now(),
                data: models,
            };

            return models;
        } catch (error) {
            console.error("OpenRouter Fetch Error:", error);
            // Return empty array or throw depending on desired behavior. 
            // Returning empty array prevents crashing the UI.
            return [];
        }
    }
}

export const openRouterService = new OpenRouterService();
