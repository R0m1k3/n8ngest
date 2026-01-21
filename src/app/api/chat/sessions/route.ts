import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const sessions = await prisma.chatSession.findMany({
            orderBy: {
                updatedAt: 'desc'
            },
            include: {
                _count: {
                    select: { messages: true }
                }
            }
        });

        return NextResponse.json(sessions);
    } catch (error) {
        console.error("Failed to fetch sessions:", error);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { title } = await req.json();
        const session = await prisma.chatSession.create({
            data: {
                title: title || "Nouvelle discussion"
            }
        });
        return NextResponse.json(session);
    } catch (error) {
        console.error("Failed to create session:", error);
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }
}
