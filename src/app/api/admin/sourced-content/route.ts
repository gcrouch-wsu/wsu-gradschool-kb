import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import { buildSourcedFromPastedHtml, fetchSourcedSection } from "@/lib/sourced-content";

const IMPORT_ERRORS: Record<string, string> = {
  invalid_url:
    "That link is not an approved source. Use an https link on an allowed source site (e.g. gradschool.wsu.edu).",
  missing_anchor:
    "The link needs a #section-anchor so a specific section can be imported (e.g. …/#graduate-program-faculty).",
  unreachable: "The source page could not be fetched right now. Try again, or use Paste HTML instead.",
  anchor_missing:
    "That section anchor was not found on the source page. The heading may have been renamed — check the link.",
};

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    html?: unknown;
    headingText?: unknown;
  } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const html = typeof body?.html === "string" ? body.html : "";
  if (!url) {
    return NextResponse.json({ message: "A source URL is required." }, { status: 400 });
  }

  try {
    if (html.trim()) {
      const section = buildSourcedFromPastedHtml(
        html,
        url,
        typeof body?.headingText === "string" ? body.headingText : undefined,
      );
      if (!section) {
        return NextResponse.json({ message: IMPORT_ERRORS.invalid_url }, { status: 400 });
      }
      return NextResponse.json(section);
    }

    const result = await fetchSourcedSection(url);
    if (!result.ok) {
      const status = result.reason === "unreachable" ? 502 : 400;
      return NextResponse.json({ message: IMPORT_ERRORS[result.reason] }, { status });
    }
    return NextResponse.json(result.section);
  } catch (error) {
    logError(error, { route: "/api/admin/sourced-content", action: "import_sourced_content" });
    return NextResponse.json({ message: "Could not import from the source." }, { status: 500 });
  }
}
