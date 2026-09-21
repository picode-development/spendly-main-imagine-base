import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { sharedStash } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const id = `debug_${createId()}`;
        await db.insert(sharedStash).values({
            id,
            rawText: JSON.stringify({
                type: "sw_debug",
                timestamp: new Date().toISOString(),
                payload: body,
            }),
        });
        return NextResponse.json({ ok: true, id });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const rows = await db.select().from(sharedStash).limit(20);
        return NextResponse.json({ rows });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message }, { status: 500 });
    }
}
