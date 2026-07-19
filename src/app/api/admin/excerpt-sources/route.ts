import { NextResponse } from "next/server";
import { filterKbsForReadAccess, getKbReadAccess } from "@/lib/auth";
import { getReadableExcerptSourcePageForPicker } from "@/lib/excerpts";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  getAllKbsForAdmin,
  getAllPageSummariesForAdmin,
  getKbById,
  getVisiblePagesForKb,
} from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import type { ContentBlock } from "@/lib/types";

interface ExcerptSourceHeading {
  blockId: string;
  text: string;
  level: 2 | 3;
}

function listExcerptHeadings(blocks: ContentBlock[]): ExcerptSourceHeading[] {
  const headings: ExcerptSourceHeading[] = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      const text = (block.text || richTextToPlainText(block.html ?? "")).trim();
      if (text) {
        headings.push({ blockId: block.blockId, text, level: block.level });
      }
    } else if (block.type === "procedure_section") {
      headings.push({ blockId: block.blockId, text: block.title, level: block.level });
    }
  }
  return headings;
}

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const kbId = url.searchParams.get("kb");
  const pageId = url.searchParams.get("page");

  try {
    if (pageId) {
      const source = await getReadableExcerptSourcePageForPicker(pageId, guard.session);
      if (!source) {
        return NextResponse.json({ message: "Page not found." }, { status: 404 });
      }
      return NextResponse.json({
        page: { id: source.page.id, title: source.page.title },
        headings: listExcerptHeadings(source.page.blocks),
      });
    }

    if (kbId) {
      const kb = await getKbById(kbId);
      if (!kb) {
        return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
      }
      const access = await getKbReadAccess(guard.session, kb);
      if (!access.canRead) {
        return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
      }
      const pages = (
        access.canReadStaffContent
          ? (await getAllPageSummariesForAdmin(kb.id)).filter((page) => page.status !== "archived")
          : await getVisiblePagesForKb(kb.id, false)
      ).filter((page) => (page.nodeKind ?? "page") === "page");
      return NextResponse.json({
        pages: pages.map((page) => ({
          id: page.id,
          title: page.title,
          path: page.path,
          status: page.status,
          visibility: page.visibility,
        })),
      });
    }

    const kbs = await filterKbsForReadAccess(guard.session, await getAllKbsForAdmin());
    return NextResponse.json({
      kbs: kbs.map((kb) => ({ id: kb.id, title: kb.title })),
    });
  } catch (error) {
    logError(error, { route: "/api/admin/excerpt-sources", action: "list_excerpt_sources" });
    return NextResponse.json({ message: "Failed to list excerpt sources." }, { status: 500 });
  }
}
