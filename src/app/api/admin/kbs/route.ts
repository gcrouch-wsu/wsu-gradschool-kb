import { NextResponse } from "next/server";
import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";
import { requireAdminMutation } from "@/lib/security";
import { slugify } from "@/lib/slug";
import type { KnowledgeBase } from "@/lib/types";

export async function GET(request: Request) {
  // Only owners/admins should view all KBs in the admin area, but we can relax 
  // this for MVP if we want editors to see the list. For now, owner only.
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    // In-memory fallback
    return NextResponse.json({ kbs: [] });
  }

  await ensureSchema();
  const sql = getSql();

  try {
    const rows = await sql`SELECT * FROM knowledge_bases ORDER BY title`;
    const kbs: KnowledgeBase[] = rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      status: row.status,
      updatedOn: row.updated_on,
    }));
    return NextResponse.json({ kbs });
  } catch (error) {
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
    // Ensure slug uniqueness
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
    };

    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${kb.id}, ${kb.slug}, ${kb.title}, ${kb.description}, ${kb.status}, ${kb.updatedOn})
    `;

    return NextResponse.json({ ok: true, kb });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create knowledge base." },
      { status: 500 }
    );
  }
}
