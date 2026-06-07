import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { isBlobEnabled, isSupportedImageType, uploadAssetBlob } from "@/lib/blob";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can change the site logo." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "A logo image file is required." }, { status: 400 });
  }
  if (!isSupportedImageType(file.type)) {
    return NextResponse.json({ message: "Use a PNG, JPG, GIF, or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Logo is larger than 5 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let url = "";
    if (isBlobEnabled()) {
      url = (await uploadAssetBlob(buffer, file.type, "site-branding")) ?? "";
    }
    if (!url) {
      url = `data:${file.type.toLowerCase()};base64,${buffer.toString("base64")}`;
    }

    await recordAuditEvent({
      session: guard.session,
      action: "settings.logo_uploaded",
      entityType: "settings",
      entityId: "singleton",
      entityLabel: "Site logo",
      kbId: null,
      details: { filename: file.name, bytes: file.size },
    });

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    logError(error, { route: "/api/admin/settings/logo", action: "upload_logo" });
    const message = error instanceof Error ? error.message : "Could not upload logo.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
