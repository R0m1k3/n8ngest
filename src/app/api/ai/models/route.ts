import { NextResponse } from "next/server";
import { openRouterService } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const models = await openRouterService.getModels();
        return NextResponse.json({ models });
    } catch (error) {
        console.error("API Models Error:", error);
        return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
    }
}
