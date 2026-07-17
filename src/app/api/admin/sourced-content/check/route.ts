import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import { checkSourcedSection } from "@/lib/sourced-content";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    anchor?: unknown;
    contentHash?: unknown;
  } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ message: "A source URL is required." }, { status: 400 });
  }

  try {
    const state = await checkSourcedSection(
      url,
      typeof body?.anchor === "string" && body.anchor ? body.anchor : undefined,
      typeof body?.contentHash === "string" && body.contentHash ? body.contentHash : undefined,
    );
    return NextResponse.json({ state });
  } catch (error) {
    logError(error, { route: "/api/admin/sourced-content/check", action: "check_sourced_content" });
    return NextResponse.json({ message: "Could not check the source." }, { status: 500 });
  }
}
