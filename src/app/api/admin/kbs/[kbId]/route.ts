import { NextResponse } from "next/server";
import { isDatabaseEnabled, getSql, ensureSchema, deleteKb } from "@/lib/db";
import { setKbRequireSummary, setKbAiPrompts } from "@/lib/kb-store";
import { normalizeAiPrompt } from "@/lib/ai-prompts";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";
import { slugify } from "@/lib/slug";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ kbId: string }> }
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const isOwner = guard.session.role === "owner";
  const isAdmin = guard.session.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ message: "Only owners or admins can update KBs." }, { status: 403 });
  }

  const { kbId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  // Admins may only toggle publish-policy flags (requireSummary). Full KB edits stay owner-only.
  if (!isOwner) {
    const keys = Object.keys(body).filter((key) => body[key] !== undefined);
    if (keys.length === 0 || keys.some((key) => key !== "requireSummary")) {
      return NextResponse.json(
        { message: "Admins can only update whether a summary is required to publish." },
        { status: 403 },
      );
    }
  }

  try {
    if (body.requireSummary !== undefined) {
      await setKbRequireSummary(kbId, body.requireSummary !== false);
    }

    if (body.aiSummaryPrompt !== undefined || body.aiPagePrompt !== undefined) {
      if (!isOwner) {
        return NextResponse.json({ message: "Only owners can update AI prompts." }, { status: 403 });
      }
      // Load current KB so partial updates keep the other prompt.
      const { getKbById } = await import("@/lib/kb-store");
      const existing = await getKbById(kbId);
      if (!existing) {
        return NextResponse.json({ message: "Knowledge base not found." }, { status: 404 });
      }
      await setKbAiPrompts(kbId, {
        aiSummaryPrompt:
          body.aiSummaryPrompt !== undefined
            ? normalizeAiPrompt(body.aiSummaryPrompt)
            : existing.aiSummaryPrompt ?? "",
        aiPagePrompt:
          body.aiPagePrompt !== undefined
            ? normalizeAiPrompt(body.aiPagePrompt)
            : existing.aiPagePrompt ?? "",
      });
    }

    if (!isOwner) {
      return NextResponse.json({ ok: true });
    }

    if (!isDatabaseEnabled()) {
      // requireSummary already handled above for in-memory; other owner fields need DB.
      if (
        body.title !== undefined ||
        body.description !== undefined ||
        body.status !== undefined ||
        body.visibility !== undefined ||
        body.slug !== undefined ||
        body.searchWidgetEnabled !== undefined ||
        body.searchWidgetScope !== undefined ||
        body.searchWidgetLabel !== undefined
      ) {
        return NextResponse.json({ message: "Database is not enabled." }, { status: 501 });
      }
      return NextResponse.json({ ok: true });
    }

    await ensureSchema();
    const sql = getSql();

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
