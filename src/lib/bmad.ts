import fs from "fs";
import path from "path";
import matter from "gray-matter";

// In Docker, the volume is mounted at /app/_bmad
// In local dev without Docker, it might be relative to the project root
const BMAD_ROOT = process.env.BMAD_ROOT || path.join(process.cwd(), "_bmad");

export interface BmadAgent {
    id: string; // filename
    name: string;
    description: string;
    content: string; // Full markdown content
    metadata: any;
}

export class BmadService {

    private getAgentsDir(): string {
        // Adjust path based on BMAD structure. 
        // Usually _bmad/core/agents
        return path.join(BMAD_ROOT, "core", "agents");
    }

    async listAgents(): Promise<BmadAgent[]> {
        const agentsDir = this.getAgentsDir();

        if (!fs.existsSync(agentsDir)) {
            console.warn(`BMAD Agents directory not found at: ${agentsDir}`);
            return [];
        }

        const files = fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"));

        return files.map(file => {
            const filePath = path.join(agentsDir, file);
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const { data, content } = matter(fileContent);

            return {
                id: file,
                name: data.name || file.replace(".md", ""),
                description: data.description || "",
                metadata: data,
                content: content
            };
        });
    }

    async getAgent(id: string): Promise<BmadAgent | null> {
        const agentsDir = this.getAgentsDir();
        const filePath = path.join(agentsDir, id);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const { data, content } = matter(fileContent);

        return {
            id,
            name: data.name || id.replace(".md", ""),
            description: data.description || "",
            metadata: data,
            content
        };
    }
}

export const bmadService = new BmadService();
