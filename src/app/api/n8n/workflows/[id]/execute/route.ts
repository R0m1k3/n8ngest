import { NextRequest, NextResponse } from "next/server";
import { n8nClient } from "@/lib/n8n";

export const dynamic = "force-dynamic";

/**
 * POST /api/n8n/workflows/[id]/execute - Execute a workflow
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        let data = {};
        try {
            data = await req.json();
        } catch {
            // No body provided, that's OK
        }
        const execution = await n8nClient.executeWorkflow(id, data);
        return NextResponse.json(execution);
    } catch (error) {
        console.error("Failed to execute workflow:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
