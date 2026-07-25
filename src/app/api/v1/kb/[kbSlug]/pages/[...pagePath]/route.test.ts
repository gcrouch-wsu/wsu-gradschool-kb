import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/v1/kb/[kbSlug]/pages/[...pagePath]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function getPage(kbSlug: string, pagePath: string[], auth = true) {
    const { GET } = await import("@/app/api/v1/kb/[kbSlug]/pages/[...pagePath]/route");
    return GET(
      new Request(`http://localhost/api/v1/kb/${kbSlug}/pages/${pagePath.join("/")}`, {
        headers: auth ? { Authorization: "Bearer test-key" } : undefined,
      }),
      { params: Promise.resolve({ kbSlug, pagePath }) },
    );
  }

  it("rejects missing API keys", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const response = await getPage("graduate-school", ["procedures"], false);
    expect(response.status).toBe(401);
  });

  it("returns a published public page", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");
    const response = await getPage("graduate-school", ["procedures", "maintaining-program-fact-sheets"]);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.kb.slug).toBe("graduate-school");
    expect(data.page.slug).toBe("maintaining-program-fact-sheets");
    expect(Array.isArray(data.page.blocks)).toBe(true);
  });

  it("hides private KBs, draft KBs, staff pages, groups, and links", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KAAS_API_KEYS", "test-key");

    expect((await getPage("graduate-school-staff", ["private-staff-orientation"])).status).toBe(404);
    expect((await getPage("draft-preview", ["procedures"])).status).toBe(404);
    expect((await getPage("graduate-school", ["templates", "graduate-program-handbooks"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference"])).status).toBe(404);
    expect((await getPage("graduate-school", ["reference", "policies-and-procedures"])).status).toBe(404);
  });
});
