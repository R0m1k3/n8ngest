import { NextResponse } from "next/server";
import { configService } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
    try {
        const configs = await configService.getAll();
        // Mask secrets if needed (simple implementation for now returns all)
        // In a real app we might want to return masked values for secrets
        return NextResponse.json(configs);
    } catch (error) {
        console.error("Settings GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // Expecting an object { key: value, ... }

        for (const [key, value] of Object.entries(body)) {
            // Simple heuristic for secrets: keys containing KEY, SECRET, PASS, TOKEN
            const isSecret = /KEY|SECRET|PASS|TOKEN/i.test(key);
            await configService.set(key, String(value), isSecret);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Settings POST Error:", error);
        return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
}
