import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { isBlobEnabled, uploadImportImage } from "@/lib/blob";
import { convertDocxToBlocks } from "@/lib/docx-import";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
  }

  const isDocx =
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!isDocx) {
    return NextResponse.json({ message: "Please upload a .docx file." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File is larger than 10 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await convertDocxToBlocks(buffer, {
      uploadImage: isBlobEnabled() ? uploadImportImage : undefined,
    });
    return NextResponse.json({
      fileName: file.name,
      title: parsed.title,
      blocks: parsed.blocks,
      messages: parsed.messages,
    });
  } catch {
    return NextResponse.json(
      { message: "Could not read that .docx file. It may be corrupt or password protected." },
      { status: 422 },
    );
  }
}
