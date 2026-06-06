import { NextResponse } from "next/server";
import { isBlobEnabled, isSupportedDocumentType, uploadAssetBlob } from "@/lib/blob";
import { createManagedAsset, getKbById } from "@/lib/kb-store";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kbId = formData?.get("kbId");
  const title = formData?.get("title");
  const description = formData?.get("description");
  if (!(file instanceof File) || typeof kbId !== "string") {
    return NextResponse.json({ message: "File and knowledge base are required." }, { status: 400 });
  }
  if (!isSupportedDocumentType(file.type)) {
    return NextResponse.json(
      { message: "Use a PDF, Word document, or plain text file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File is larger than 25 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let body = "";
  if (isBlobEnabled()) {
    const url = await uploadAssetBlob(buffer, file.type);
    if (!url) {
      return NextResponse.json({ message: "Could not store file in object storage." }, { status: 500 });
    }
    body = url;
  } else {
    body = `data:${file.type.toLowerCase()};base64,${buffer.toString("base64")}`;
  }

  try {
    const asset = await createManagedAsset({
      body,
      fileSizeBytes: file.size,
      homeKbId: kbId,
      mimeType: file.type.toLowerCase(),
      originalFilename: file.name,
      assetType: "document",
      title: typeof title === "string" ? title : file.name.replace(/\.[^.]+$/, ""),
      description: typeof description === "string" ? description : undefined,
    });
    const kb = await getKbById(asset.homeKbId);
    const url = kb ? `/kb/${kb.slug}/files/${asset.slug}` : null;
    return NextResponse.json({ ok: true, asset, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload document.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
