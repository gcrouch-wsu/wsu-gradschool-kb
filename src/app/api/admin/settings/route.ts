import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isDatabaseEnabled, loadSiteSettings, saveSiteSettings } from "@/lib/db";
import { requireAdminMutation } from "@/lib/security";
import { normalizeSiteSettings } from "@/lib/site-settings";

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can view site settings." }, { status: 403 });
  }

  const settings = await loadSiteSettings();
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can change site settings." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  try {
    const settings = normalizeSiteSettings(body);
    await saveSiteSettings(settings);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to save site settings." },
      { status: 500 },
    );
  }
}
