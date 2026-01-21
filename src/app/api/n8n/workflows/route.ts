import { NextRequest, NextResponse } from "next/server";
import { n8nClient } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/**
 * GET /api/n8n/workflows - Get all workflows
 */
export async function GET() {
    try {
        const workflows = await n8nClient.getWorkflows();
        return NextResponse.json({ workflows });
    } catch (error) {
        console.error("Failed to get workflows:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/n8n/workflows - Create a new workflow
 */
export async function POST(req: NextRequest) {
    try {
        const { name, nodes, connections } = await req.json();
        const workflow = await n8nClient.createWorkflow(name, nodes, connections);
        return NextResponse.json(workflow);
    } catch (error) {
        console.error("Failed to create workflow:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
