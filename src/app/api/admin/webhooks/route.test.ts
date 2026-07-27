import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { WebhookEndpoint } from "@/lib/types";

const hook: WebhookEndpoint = {
  id: "hook-1",
  url: "https://example.edu/webhook",
  secret: "stored-secret",
  events: ["page.published"],
  enabled: true,
  createdAt: "2026-07-25T12:00:00.000Z",
};

function session(role: AdminSession["role"]): AdminSession {
  return {
    userId: `${role}-1`,
    email: `${role}@example.edu`,
    role,
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
  };
}

describe("/api/admin/webhooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function mockAdmin(role: AdminSession["role"] = "owner") {
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: `${role}@example.edu`,
      session: session(role),
    });
  }

  it("does not expose stored secrets in webhook list responses", async () => {
    await mockAdmin("owner");
    const webhooks = await import("@/lib/webhooks");
    vi.spyOn(webhooks, "listWebhooks").mockResolvedValue([hook]);

    const { GET } = await import("@/app/api/admin/webhooks/route");
    const response = await GET(new Request("http://localhost/api/admin/webhooks"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.hooks).toEqual([
      {
        id: hook.id,
        url: hook.url,
        events: hook.events,
        enabled: hook.enabled,
        createdAt: hook.createdAt,
        hasSecret: true,
      },
    ]);
    expect(JSON.stringify(data)).not.toContain(hook.secret);
  });

  it("keeps webhook administration owner/admin only", async () => {
    await mockAdmin("manager");
    const { GET } = await import("@/app/api/admin/webhooks/route");
    const response = await GET(new Request("http://localhost/api/admin/webhooks"));
    expect(response.status).toBe(403);
  });

  it("rejects non-https webhook URLs", async () => {
    await mockAdmin("owner");
    const webhooks = await import("@/lib/webhooks");
    const createSpy = vi.spyOn(webhooks, "createWebhook");

    const { POST } = await import("@/app/api/admin/webhooks/route");
    const response = await POST(
      new Request("http://localhost/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://example.edu/webhook", events: ["page.published"] }),
      }),
    );
    expect(response.status).toBe(400);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("returns the admin guard response", async () => {
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }),
    });
    const { GET } = await import("@/app/api/admin/webhooks/route");
    const response = await GET(new Request("http://localhost/api/admin/webhooks"));
    expect(response.status).toBe(401);
  });
});
