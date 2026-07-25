import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight uptime probe — no DB, no auth. Use for deploy/smoke checks only.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "wsu-gradschool-kb",
    timestamp: new Date().toISOString(),
  });
}
