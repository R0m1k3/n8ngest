import { N8nWorkflow, N8nExecution } from "./types";
import { configService } from "./config";

export class N8nClient {

    private async getConfig() {
        const baseUrl = await configService.get("N8N_API_URL") || process.env.N8N_API_URL || "http://localhost:5678";
        const apiKey = await configService.get("N8N_API_KEY") || process.env.N8N_API_KEY || "";
        return { baseUrl, apiKey };
    }

    private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
        const { baseUrl, apiKey } = await this.getConfig();
        const url = `${baseUrl}/api/v1${path}`;
        const headers = {
            "X-N8N-API-KEY": apiKey,
            "Content-Type": "application/json",
            ...options.headers,
        };

        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                throw new Error(`n8n API Error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch ${url}:`, error);
            throw error;
        }
    }

    async getWorkflows(): Promise<N8nWorkflow[]> {
        const data = await this.fetch<{ data: N8nWorkflow[] }>("/workflows");
        return data.data;
    }

    async getWorkflow(id: string): Promise<N8nWorkflow> {
        return await this.fetch<N8nWorkflow>(`/workflows/${id}`);
    }

    async activateWorkflow(id: string, active: boolean): Promise<N8nWorkflow> {
        return await this.fetch<N8nWorkflow>(`/workflows/${id}/activate`, {
            method: "POST",
            body: JSON.stringify({ active }),
        });
    }

    async createWorkflow(name: string, nodes: any[] = [], connections: any = {}): Promise<N8nWorkflow> {
        return await this.fetch<N8nWorkflow>("/workflows", {
            method: "POST",
            body: JSON.stringify({ name, nodes, connections }),
        });
    }
}

export const n8nClient = new N8nClient();
