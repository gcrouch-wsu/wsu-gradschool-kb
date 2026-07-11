import { NextResponse } from "next/server";
import { buildKbExportStream, canExportKb, getExportingSession } from "@/lib/kb-export";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ kbId: string }> }) {
  const session = await getExportingSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  if (!canExportKb(session)) {
    return NextResponse.json({ message: "Only owners can export knowledge bases." }, { status: 403 });
  }

  const { kbId } = await context.params;
  try {
    const archive = await buildKbExportStream(kbId);
    if (!archive) {
      return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
    }
    return new Response(archive.stream, {
      headers: {
        "content-type": archive.contentType,
        "content-disposition": `attachment; filename="${archive.filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs/[kbId]/export", kbId });
    return NextResponse.json({ message: "Failed to export knowledge base." }, { status: 500 });
  }
}
