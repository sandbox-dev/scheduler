import { NextResponse } from "next/server";

// Which build is live right now — the school portal compares it with the build
// its open page came from (UpdateAvailableBanner). Public; just an id.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
