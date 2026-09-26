import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/v1/kb/[kbSlug]/pages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("lists pages for a scoped private KB key and hides other KBs", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "graduate-school-staff:staff-only-key");
    const { GET } = await import("@/app/api/v1/kb/[kbSlug]/pages/route");

    const allowed = await GET(
      new Request("http://localhost/api/v1/kb/graduate-school-staff/pages", {
        headers: { Authorization: "Bearer staff-only-key" },
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school-staff" }) },
    );
    expect(allowed.status).toBe(200);
    const data = await allowed.json();
    expect(data.kb.slug).toBe("graduate-school-staff");
    expect(data.pages.some((page: { slug: string }) => page.slug === "private-staff-orientation")).toBe(
      true,
    );

    const blocked = await GET(
      new Request("http://localhost/api/v1/kb/graduate-school/pages", {
        headers: { Authorization: "Bearer staff-only-key" },
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school" }) },
    );
    expect(blocked.status).toBe(404);
  });
});

describe("POST /api/v1/kb/[kbSlug]/pages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("creates a published page when the scoped key may access the KB", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "graduate-school-staff:staff-only-key");
    const { POST } = await import("@/app/api/v1/kb/[kbSlug]/pages/route");

    const response = await POST(
      new Request("http://localhost/api/v1/kb/graduate-school-staff/pages", {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-only-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Agent Handoff Notes",
          summary: "Notes for the next agent session.",
          blocks: [{ blockId: "p1", type: "paragraph", text: "Session one complete." }],
          contactEmail: "gradschool@wsu.edu",
        }),
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school-staff" }) },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.page.title).toBe("Agent Handoff Notes");
    expect(Array.isArray(data.page.path)).toBe(true);
  });

  it("creates a group node (a tree heading) without requiring blocks or running the publish gate", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "graduate-school-staff:staff-only-key");
    const { POST } = await import("@/app/api/v1/kb/[kbSlug]/pages/route");

    const response = await POST(
      new Request("http://localhost/api/v1/kb/graduate-school-staff/pages", {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-only-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "A Group Heading", nodeKind: "group" }),
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school-staff" }) },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.page.title).toBe("A Group Heading");
  });

  it("rejects an unrecognized nodeKind", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "graduate-school-staff:staff-only-key");
    const { POST } = await import("@/app/api/v1/kb/[kbSlug]/pages/route");

    const response = await POST(
      new Request("http://localhost/api/v1/kb/graduate-school-staff/pages", {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-only-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "A Link", nodeKind: "link" }),
      }),
      { params: Promise.resolve({ kbSlug: "graduate-school-staff" }) },
    );

    expect(response.status).toBe(400);
  });
});
