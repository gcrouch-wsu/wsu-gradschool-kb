import { NextResponse } from "next/server";
import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";
import { filterKbsForSession } from "@/lib/auth";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import { slugify } from "@/lib/slug";
import type { KbStatus, KnowledgeBase } from "@/lib/types";

export async function GET(request: Request) {

  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (!isDatabaseEnabled()) {

    return NextResponse.json({ kbs: [] });
  }

  await ensureSchema();
  const sql = getSql();

  try {
    const rows = (await sql`SELECT * FROM knowledge_bases ORDER BY title`) as unknown as Array<{
      id: string;
      title: string;
      slug: string;
      description: string;
      status: KbStatus;
      updated_on: string;
      home_page_id?: string | null;
    }>;
    const allKbs: KnowledgeBase[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      status: row.status,
      updatedOn: row.updated_on,
      homepagePageId: row.home_page_id ?? null,
    }));
    const kbs = await filterKbsForSession(guard.session, allKbs);
    return NextResponse.json({ kbs });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs", action: "list_kbs" });
    return NextResponse.json({ message: "Failed to list knowledge bases." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can create KBs." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.title) {
    return NextResponse.json({ message: "Title is required." }, { status: 400 });
  }

  const title = body.title.trim();
  let slug = body.slug?.trim() ? slugify(body.slug) : slugify(title);

  await ensureSchema();
  const sql = getSql();

  try {

    const existing = await sql`SELECT slug FROM knowledge_bases WHERE slug = ${slug}`;
    if (existing.length > 0) {
      slug = `${slug}-${crypto.randomUUID().split("-")[0]}`;
    }

    const kb: KnowledgeBase = {
      id: `kb-${crypto.randomUUID()}`,
      title,
      slug,
      description: body.description?.trim() || "",
      status: body.status === "published" ? "published" : "draft",
      updatedOn: new Date().toISOString().slice(0, 10),
      homepagePageId: null,
    };

    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${kb.id}, ${kb.slug}, ${kb.title}, ${kb.description}, ${kb.status}, ${kb.updatedOn})
    `;

    return NextResponse.json({ ok: true, kb });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs", action: "create_kb" });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create knowledge base." },
      { status: 500 }
    );
  }
}
