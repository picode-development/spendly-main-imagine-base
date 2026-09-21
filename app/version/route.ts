import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Returns the deployed build ID or commit so open sessions can detect new deploys
export function GET() {
    const version =
        process.env.NEXT_PUBLIC_BUILD_ID ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        "v7";

    return NextResponse.json(
        { version },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
}
