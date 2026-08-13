import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Returns the deployed commit so open sessions can detect new deploys
export function GET() {
    return NextResponse.json(
        { version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
        { headers: { "Cache-Control": "no-store" } },
    );
}
