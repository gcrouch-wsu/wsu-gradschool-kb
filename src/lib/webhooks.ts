import { randomUUID } from "crypto";
import { createHmac } from "crypto";
import { isDatabaseEnabled, getSql, ensureSchema } from "@/lib/db";
import type { WebhookEndpoint, WebhookEvent } from "@/lib/types";

const VALID_EVENTS = new Set<WebhookEvent>([
  "page.published",
  "page.proposed",
  "page.draft",
  "review.overdue",
  "asset.replaced",
]);

function mapRow(row: {
  id: string;
  url: string;
  secret: string;
  events: unknown;
  enabled: boolean;
  created_at: string;
}): WebhookEndpoint {
  const events = Array.isArray(row.events)
    ? row.events.filter((event): event is WebhookEvent => VALID_EVENTS.has(event as WebhookEvent))
    : [];
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    events,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function listWebhooks(): Promise<WebhookEndpoint[]> {
  if (!isDatabaseEnabled()) {
    return [];
  }
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, url, secret, events, enabled, created_at
    FROM webhooks
    ORDER BY created_at DESC
  `) as unknown as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function createWebhook(input: {
  url: string;
  secret?: string;
  events: WebhookEvent[];
}): Promise<WebhookEndpoint> {
  const id = randomUUID();
  const secret = input.secret?.trim() || randomUUID();
  const events = input.events.filter((event) => VALID_EVENTS.has(event));
  if (!isDatabaseEnabled()) {
    return { id, url: input.url, secret, events, enabled: true, createdAt: new Date().toISOString() };
  }
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO webhooks (id, url, secret, events, enabled)
    VALUES (${id}, ${input.url}, ${secret}, ${JSON.stringify(events)}, TRUE)
  `;
  return { id, url: input.url, secret, events, enabled: true, createdAt: new Date().toISOString() };
}

export async function deleteWebhook(id: string): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM webhooks WHERE id = ${id}`;
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function dispatchWebhooks(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const endpoints = (await listWebhooks()).filter((hook) => hook.enabled && hook.events.includes(event));
  if (endpoints.length === 0) {
    return;
  }
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), payload });
  await Promise.all(
    endpoints.map(async (hook) => {
      try {
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-kb-signature": signPayload(hook.secret, body),
            "x-kb-event": event,
          },
          body,
        });
      } catch {
        // Non-fatal: webhook delivery is best-effort.
      }
    }),
  );
}
