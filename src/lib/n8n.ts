import { N8nWorkflow, N8nExecution } from "./types";
import { configService } from "./config";

export class N8nClient {

    private async getConfig() {
        let baseUrl = await configService.get("N8N_API_URL") || process.env.N8N_API_URL || "http://localhost:5678";
        // Remove trailing slash to prevent double slashes
        baseUrl = baseUrl.replace(/\/+$/, "");
        const apiKey = await configService.get("N8N_API_KEY") || process.env.N8N_API_KEY || "";
        return { baseUrl, apiKey };
    }

    private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
        const { baseUrl, apiKey } = await this.getConfig();
        const url = `${baseUrl}/api/v1${path}`;

        // Debug logging
        console.log(`n8n API call to: ${url}`);
        console.log(`n8n API key present: ${apiKey ? `Yes (${apiKey.length} chars, starts with ${apiKey.substring(0, 4)}...)` : "NO - MISSING!"}`);

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
            const text = await response.text();
            // Check if response is HTML (error page or login page)
            if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
                throw new Error(`n8n API returned HTML instead of JSON. Possible auth issue or wrong URL. Check N8N_API_URL and N8N_API_KEY.`);
            }
            return JSON.parse(text);
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

    /**
     * Update an existing workflow
     */
    async updateWorkflow(id: string, data: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
        return await this.fetch<N8nWorkflow>(`/workflows/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }

    /**
     * Execute a workflow manually
     */
    async executeWorkflow(id: string, data?: Record<string, any>): Promise<N8nExecution> {
        return await this.fetch<N8nExecution>(`/workflows/${id}/run`, {
            method: "POST",
            body: JSON.stringify(data || {}),
        });
    }

    /**
     * Get workflow executions history
     */
    async getExecutions(workflowId?: string, limit: number = 10): Promise<N8nExecution[]> {
        const path = workflowId
            ? `/executions?workflowId=${workflowId}&limit=${limit}`
            : `/executions?limit=${limit}`;
        const data = await this.fetch<{ data: N8nExecution[] }>(path);
        return data.data;
    }

    /**
     * Search workflow by name (partial match)
     */
    async findWorkflowByName(name: string): Promise<N8nWorkflow | undefined> {
        const workflows = await this.getWorkflows();
        const lowerName = name.toLowerCase();
        return workflows.find(w => w.name.toLowerCase().includes(lowerName));
    }
}

export const n8nClient = new N8nClient();

