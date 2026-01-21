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
     * n8n requires PUT with the complete workflow, not partial PATCH
     * So we first GET the workflow, merge changes, then PUT it back
     */
    async updateWorkflow(id: string, data: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
        // First, get the current workflow
        const currentWorkflow = await this.getWorkflow(id);

        // Merge the changes into the current workflow
        const updatedWorkflow = {
            ...currentWorkflow,
            ...data,
        };

        // If nodes are being updated, merge them by name/id
        if (data.nodes && Array.isArray(data.nodes)) {
            const mergedNodes = [...currentWorkflow.nodes];
            for (const newNode of data.nodes) {
                const existingIndex = mergedNodes.findIndex(
                    (n) => n.name === newNode.name || n.id === newNode.id
                );
                if (existingIndex >= 0) {
                    // Merge node parameters
                    mergedNodes[existingIndex] = {
                        ...mergedNodes[existingIndex],
                        ...newNode,
                        parameters: {
                            ...mergedNodes[existingIndex].parameters,
                            ...newNode.parameters,
                        },
                    };
                } else {
                    // Add new node
                    mergedNodes.push(newNode);
                }
            }
            updatedWorkflow.nodes = mergedNodes;
        }

        // If connections are being updated, merge them
        if (data.connections) {
            updatedWorkflow.connections = {
                ...currentWorkflow.connections,
                ...data.connections,
            };
        }

        // Sanitize payload for n8n API
        // 1. Tags must be an array of IDs, not objects
        const payload: any = { ...updatedWorkflow };
        if (Array.isArray(payload.tags)) {
            payload.tags = payload.tags.map((t: any) => typeof t === 'object' && t.id ? t.id : t);
        }

        // 2. Remove read-only fields that might cause 400 error
        delete payload.createdAt;
        delete payload.updatedAt;
        delete payload.versionId; // Important: versionId cannot be updated manually
        delete payload.pinData;   // Can cause issues if too large or malformed

        // n8n API sometimes rejects 'active' in PUT if it's already active (requires separate endpoint usually)
        // But for now let's try keeping it consistent or removing if it causes issues.
        // Let's rely on n8n handling activation state separately if needed.
        // delete payload.active; 

        // 3. Ensure nodes don't have extra readonly properties if they came from GET
        if (Array.isArray(payload.nodes)) {
            payload.nodes = payload.nodes.map((node: any) => {
                const cleanNode = { ...node };
                // Remove potential runtime data
                delete cleanNode.executionId;
                delete cleanNode.executionData;
                return cleanNode;
            });
        }

        console.log(`Updating workflow ${id} with PUT (${payload.nodes.length} nodes)`);
        console.log(`Payload tags: ${JSON.stringify(payload.tags)}`);

        // Log payload snippet for debug
        // console.log("Payload:", JSON.stringify(payload).slice(0, 500) + "...");

        return await this.fetch<N8nWorkflow>(`/workflows/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
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

