import { NextResponse } from "next/server";
import { createManagedAsset } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import { parseVideoUrl } from "@/lib/video";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body || !body.kbId || !body.url) {
    return NextResponse.json({ message: "Knowledge base ID and URL are required." }, { status: 400 });
  }

  const denied = await requireKbAccess(guard.session, body.kbId);
  if (denied) {
    return denied;
  }

  const { provider, embedId } = parseVideoUrl(body.url);

  try {
    const asset = await createManagedAsset({
      homeKbId: body.kbId,
      assetType: "video",
      title: body.title,
      description: body.description,
      body: body.url, // Store raw URL in body for reference
      mimeType: `video/x-${provider}`, // Use a semantic mime type to hint at provider
      originalFilename: `${provider}-link`,
      fileSizeBytes: 0,
    });

    // Note: We might want to store embedId in a dedicated column later,
    // but for now the editor blocks will handle the parsing or we can
    // return it in the response.
    return NextResponse.json({ ok: true, asset, provider, embedId });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create video asset." },
      { status: 500 },
    );
  }
}
