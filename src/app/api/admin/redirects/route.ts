import { NextResponse } from "next/server";
import { getRedirectsForAdmin, upsertManualRedirect } from "@/lib/kb-store";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const kbId = new URL(request.url).searchParams.get("kbId")?.trim() ?? "";
  if (!kbId) {
    return NextResponse.json({ message: "kbId is required." }, { status: 400 });
  }

  const redirects = await getRedirectsForAdmin(kbId);
  return NextResponse.json({ ok: true, redirects });
}

interface CreateBody {
  kbId?: unknown;
  fromPath?: unknown;
  toPath?: unknown;
  reason?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : "";
  const fromPath = typeof body?.fromPath === "string" ? body.fromPath : "";
  const toPath = typeof body?.toPath === "string" ? body.toPath : "";
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  if (!kbId || !fromPath || !toPath) {
    return NextResponse.json({ message: "kbId, fromPath, and toPath are required." }, { status: 400 });
  }

  try {
    const redirect = await upsertManualRedirect({ kbId, fromPath, toPath, reason });
    return NextResponse.json({ ok: true, redirect });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save redirect.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
