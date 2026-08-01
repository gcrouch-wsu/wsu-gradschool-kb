import { NextResponse } from "next/server";
import { isPubliclyRoutableUrl, parseOutboundWebhookUrl } from "@/lib/net-guard";
import { requireAdminMutation } from "@/lib/security";
import { createWebhook, deleteWebhook, listWebhooks } from "@/lib/webhooks";
import type { WebhookEndpoint, WebhookEvent } from "@/lib/types";

const VALID_EVENTS = new Set<WebhookEvent>([
  "page.published",
  "page.proposed",
  "page.draft",
  "review.overdue",
  "asset.replaced",
  "excerpt.stale",
]);

type WebhookListItem = Omit<WebhookEndpoint, "secret"> & { hasSecret: boolean };

function serializeWebhook(hook: WebhookEndpoint): WebhookListItem {
  return {
    id: hook.id,
    url: hook.url,
    events: hook.events,
    enabled: hook.enabled,
    createdAt: hook.createdAt,
    hasSecret: Boolean(hook.secret),
  };
}


export async function GET(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  const hooks = (await listWebhooks()).map(serializeWebhook);
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
  const target = parseOutboundWebhookUrl(url);
  if (!target) {
    return NextResponse.json(
      { message: "Webhook URL must be an https:// address on a public host, with no credentials." },
      { status: 400 },
    );
  }
  if (!(await isPubliclyRoutableUrl(target))) {
    return NextResponse.json(
      { message: "Webhook URL resolves to a private or link-local address, which is not allowed." },
      { status: 400 },
    );
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
