import { NextRequest, NextResponse } from "next/server";
import { n8nClient } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/**
 * GET /api/n8n/workflows/[id] - Get workflow details
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const workflow = await n8nClient.getWorkflow(id);
        return NextResponse.json(workflow);
    } catch (error) {
        console.error("Failed to get workflow:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * PATCH /api/n8n/workflows/[id] - Update workflow
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const data = await req.json();
        const workflow = await n8nClient.updateWorkflow(id, data);
        return NextResponse.json(workflow);
    } catch (error) {
        console.error("Failed to update workflow:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
