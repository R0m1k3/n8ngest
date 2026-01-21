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
        // console.log(`n8n API key present: ${apiKey ? `Yes (${apiKey.length} chars)` : "NO"}`);

        const headers = {
            "X-N8N-API-KEY": apiKey,
            "Content-Type": "application/json",
            ...options.headers,
        };

        try {
            const response = await fetch(url, { ...options, headers });

            // Try to parse JSON regardless of status to extract error info
            const text = await response.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }

            if (!response.ok) {
                const errorMsg = typeof data === 'object' && data.message ? data.message : JSON.stringify(data);
                console.error(`n8n API Response Error (${response.status}):`, errorMsg);
                throw new Error(`n8n API Error: ${response.status} ${response.statusText} - ${errorMsg}`);
            }

            // Check if response is HTML (error page or login page) but 200 OK (rare but possible)
            if (typeof data === 'string' && (data.startsWith("<!DOCTYPE") || data.startsWith("<html"))) {
                throw new Error(`n8n API returned HTML instead of JSON. Possible auth issue or wrong URL.`);
            }

            return data as T;
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
        console.log(`[DEBUG_BUILD_1780] Starting update for workflow ${id}`);

        // First, get the current workflow
        const currentWorkflow = await this.getWorkflow(id);
        const wasActive = currentWorkflow.active;

        if (wasActive) {
            console.log(`Workflow ${id} is active. Deactivating before update...`);
            try {
                await this.activateWorkflow(id, false);
            } catch (e) {
                console.warn("Failed to deactivate workflow, trying update anyway:", e);
            }
        }

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
        const payload: any = { ...updatedWorkflow };

        // Ensure payload says it is inactive (since we deactivated it)
        payload.active = false;

        // 1. Tags must be an array of IDs, not objects
        if (Array.isArray(payload.tags)) {
            payload.tags = payload.tags.map((t: any) => typeof t === 'object' && t.id ? t.id : t);
        }

        // 2. Remove read-only fields that might cause 400 error
        delete payload.createdAt;
        delete payload.updatedAt;
        delete payload.versionId; // Important: versionId cannot be updated manually
        delete payload.pinData;   // Can cause issues if too large or malformed
        delete payload.settings?.saveExecutionProgress; // Sometimes causes issues

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
                delete cleanNode.typeVersion; // Often read-only
                return cleanNode;
            });
        }

        console.log(`Updating workflow ${id} with PUT (${payload.nodes.length} nodes)`);
        console.log(`Payload tags: ${JSON.stringify(payload.tags)}`);

        // Log payload snippet for debug
        // console.log("Payload:", JSON.stringify(payload).slice(0, 500) + "...");

        try {
            const result = await this.fetch<N8nWorkflow>(`/workflows/${id}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            if (wasActive) {
                console.log(`Re-activating workflow ${id}...`);
                await this.activateWorkflow(id, true);
                result.active = true;
            }

            return result;
        } catch (error) {
            // Try to reactivate if update failed
            if (wasActive) {
                console.log(`Update failed, ensuring workflow ${id} is re-activated...`);
                await this.activateWorkflow(id, true).catch(() => { });
            }
            throw error;
        }
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

