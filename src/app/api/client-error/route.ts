import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

/** Best-effort client error intake for public/admin error boundaries. */
export async function POST(request: Request) {
  const limit = await rateLimit("client-error", 30, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    digest?: unknown;
    path?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "Client error";
  logError(new Error(message), {
    route: typeof body?.path === "string" ? body.path.slice(0, 200) : "client",
    action: "client_error",
    digest: typeof body?.digest === "string" ? body.digest : undefined,
  });
  return NextResponse.json({ ok: true });
}
