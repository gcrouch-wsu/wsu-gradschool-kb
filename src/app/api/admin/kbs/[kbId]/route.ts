import { NextResponse } from "next/server";
import { isDatabaseEnabled, getSql, ensureSchema, deleteKb } from "@/lib/db";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import { slugify } from "@/lib/slug";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ kbId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can update KBs." }, { status: 403 });
  }

  if (!isDatabaseEnabled()) {
    return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
  }

  const { kbId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  try {
    const updates: {
      updated_on: string;
      title?: string;
      description?: string;
      status?: "published" | "draft";
      visibility?: "public" | "private";
      slug?: string;
    } = { updated_on: new Date().toISOString().slice(0, 10) };

    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.status !== undefined) updates.status = body.status === "published" ? "published" : "draft";
    if (body.visibility !== undefined) updates.visibility = body.visibility === "private" ? "private" : "public";

    if (body.searchWidgetEnabled !== undefined) {
      await sql`UPDATE knowledge_bases SET search_widget_enabled = ${body.searchWidgetEnabled === true} WHERE id = ${kbId}`;
    }
    if (body.searchWidgetScope !== undefined) {
      await sql`UPDATE knowledge_bases SET search_widget_scope = ${body.searchWidgetScope === "all" ? "all" : "kb"} WHERE id = ${kbId}`;
    }
    if (body.searchWidgetLabel !== undefined) {
      await sql`UPDATE knowledge_bases SET search_widget_label = ${typeof body.searchWidgetLabel === "string" ? body.searchWidgetLabel.trim().slice(0, 120) : ""} WHERE id = ${kbId}`;
    }
    if (
      body.searchWidgetEnabled !== undefined ||
      body.searchWidgetScope !== undefined ||
      body.searchWidgetLabel !== undefined
    ) {
      await sql`UPDATE knowledge_bases SET updated_on = ${updates.updated_on} WHERE id = ${kbId}`;
    }

    if (body.slug !== undefined) {
      let slug = slugify(body.slug);
      const existing = await sql`SELECT slug FROM knowledge_bases WHERE slug = ${slug} AND id != ${kbId}`;
      if (existing.length > 0) {
        slug = `${slug}-${crypto.randomUUID().split("-")[0]}`;
      }
      updates.slug = slug;
    }

    if (Object.keys(updates).length > 1) { 
        if (updates.title) await sql`UPDATE knowledge_bases SET title = ${updates.title} WHERE id = ${kbId}`;
        if (updates.description !== undefined) await sql`UPDATE knowledge_bases SET description = ${updates.description} WHERE id = ${kbId}`;
        if (updates.status) await sql`UPDATE knowledge_bases SET status = ${updates.status} WHERE id = ${kbId}`;
        if (updates.visibility) await sql`UPDATE knowledge_bases SET visibility = ${updates.visibility} WHERE id = ${kbId}`;
        if (updates.slug) await sql`UPDATE knowledge_bases SET slug = ${updates.slug} WHERE id = ${kbId}`;
        await sql`UPDATE knowledge_bases SET updated_on = ${updates.updated_on} WHERE id = ${kbId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs/[kbId]", action: "update_kb", kbId });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update knowledge base." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ kbId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  if (guard.session.role !== "owner") {
    return NextResponse.json({ message: "Only owners can delete KBs." }, { status: 403 });
  }

  const { kbId } = await context.params;

  try {
    await deleteKb(kbId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, { route: "/api/admin/kbs/[kbId]", action: "delete_kb", kbId });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete knowledge base." },
      { status: 500 }
    );
  }
}
