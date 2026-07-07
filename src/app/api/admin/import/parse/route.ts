import { NextResponse } from "next/server";
import { isBlobEnabled, uploadImportImage } from "@/lib/blob";
import { convertDocxToBlocks } from "@/lib/docx-import";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_CONTENT_TYPE = "application/msword";

const MACRO_EXTENSIONS = [".docm", ".dotm", ".dot"];

type UploadKind = "docx" | "doc";

function detectKind(file: File): UploadKind | null {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".docx") || file.type === DOCX_CONTENT_TYPE) {
    return "docx";
  }
  if (lowerName.endsWith(".doc") || file.type === DOC_CONTENT_TYPE) {
    return "doc";
  }
  return null;
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  if (MACRO_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) || file.type.includes("macroEnabled")) {
    return NextResponse.json(
      { message: "Macro-enabled Word files are not allowed. Save as a plain .docx and try again." },
      { status: 400 },
    );
  }

  const kind = detectKind(file);
  if (!kind) {
    return NextResponse.json({ message: "Please upload a .docx or .doc file." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ message: "That file is empty." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File is larger than 25 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fallbackTitle = file.name.replace(/\.(docx|doc)$/i, "");
    let parsed;
    if (kind === "docx") {
      parsed = await convertDocxToBlocks(buffer, {
        uploadImage: isBlobEnabled() ? uploadImportImage : undefined,
      });
    } else {
      const { convertDocToBlocks } = await import("@/lib/doc-import");
      parsed = await convertDocToBlocks(buffer, fallbackTitle);
    }
    return NextResponse.json({
      fileName: file.name,
      title: parsed.title,
      blocks: parsed.blocks,
      messages: parsed.messages,
    });
  } catch {
    return NextResponse.json(
      { message: "Could not read that file. It may be corrupt, password protected, or an unsupported format." },
      { status: 422 },
    );
  }
}
