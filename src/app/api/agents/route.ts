import { NextResponse } from "next/server";
import { bmadService } from "@/lib/bmad";

export async function GET() {
    try {
        const agents = await bmadService.listAgents();
        return NextResponse.json({ agents });
    } catch (error) {
        console.error("Failed to list agents:", error);
        return NextResponse.json({ error: "Failed to list agents" }, { status: 500 });
    }
}
