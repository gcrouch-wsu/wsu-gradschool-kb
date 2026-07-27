import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/security";
import { createWebhook, deleteWebhook, listWebhooks } from "@/lib/webhooks";
import type { WebhookEvent } from "@/lib/types";

const VALID_EVENTS = new Set<WebhookEvent>([
  "page.published",
  "page.proposed",
  "page.draft",
  "review.overdue",
  "asset.replaced",
]);

export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const hooks = await listWebhooks();
  return NextResponse.json({ hooks });
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    secret?: unknown;
    events?: unknown;
  } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url.startsWith("https://")) {
    return NextResponse.json({ message: "Webhook URL must use https." }, { status: 400 });
  }
  const events = Array.isArray(body?.events)
    ? body!.events.filter((event): event is WebhookEvent => VALID_EVENTS.has(event as WebhookEvent))
    : (["page.published"] as WebhookEvent[]);
  const hook = await createWebhook({
    url,
    secret: typeof body?.secret === "string" ? body.secret : undefined,
    events,
  });
  return NextResponse.json({ hook });
}

export async function DELETE(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ message: "Missing webhook id." }, { status: 400 });
  }
  await deleteWebhook(id);
  return NextResponse.json({ ok: true });
}
