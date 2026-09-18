import { expect, test, type BrowserContext } from "@playwright/test";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  validateAdminCredentials,
  type AdminSession,
} from "../../src/lib/auth";

// Port comes from playwright.a11y.config.ts, which runs in this process — hardcoding 3000
// pointed these at whatever dev server happened to be running.
const BASE = `http://127.0.0.1:${process.env.A11Y_PORT || 3100}`;

async function addViewerCookie(context: BrowserContext) {
  const bootstrap = await validateAdminCredentials("admin@example.edu", "ChangeMe123!");
  expect(bootstrap).not.toBeNull();
  const viewerSession: AdminSession = {
    ...bootstrap!,
    userId: "seed-viewer-private-staff",
    email: "viewer@example.edu",
    role: "viewer",
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  await context.addCookies([
    {
      name: ADMIN_COOKIE_NAME,
      value: createAdminSessionToken(viewerSession),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(viewerSession.expiresAt / 1000),
    },
  ]);
}

// Page routes stream behind the root loading boundary, so the HTTP status is
// committed before authorization runs (often 200 even for not-found UI).
async function expectNotFoundUi(page: import("@playwright/test").Page, path: string, hiddenText: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: /not found/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(hiddenText);
}

async function expectPrivateGateUi(page: import("@playwright/test").Page, path: string, hiddenText: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: /private knowledge base/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^sign in$/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(hiddenText);
}

test("anonymous visitors get a sign-in gate for private KB routes and a sign-in redirect for assets", async ({
  context,
  page,
}) => {
  await expectPrivateGateUi(page, "/kb/graduate-school-staff/private-staff-orientation", "Orientation");
  await expectPrivateGateUi(page, "/kb/graduate-school-staff", "Private operational guidance");

  const signIn = page.getByRole("link", { name: /^sign in$/i });
  await expect(signIn).toHaveAttribute("href", /\/admin\/sign-in\?next=/);

  const nonexistent = await context.request.get(`${BASE}/kb/no-such-kb-parity-check`);
  expect(nonexistent.status()).toBe(200);
  // Private published KBs deliberately disclose existence via the gate; drafts/missing stay 404 UI.

  const asset = await context.request.get(
    `${BASE}/kb/graduate-school-staff/files/private-staff-orientation-checklist`,
    { maxRedirects: 0 },
  );
  expect(asset.status()).toBe(307);
  expect(asset.headers().location).toMatch(/\/admin\/sign-in\?next=/);
});

test("anonymous visitors and viewers get the not-found page for draft KBs", async ({ browser, page }) => {
  await expectNotFoundUi(page, "/kb/draft-preview", "Draft Preview Knowledge Base");

  const viewerContext = await browser.newContext();
  await addViewerCookie(viewerContext);
  const viewerPage = await viewerContext.newPage();
  await expectNotFoundUi(viewerPage, "/kb/draft-preview", "Draft Preview Knowledge Base");
  await viewerContext.close();
});

test("assigned viewer gets private assets with private, no-store caching", async ({ context }) => {
  await addViewerCookie(context);
  const response = await context.request.get(
    `${BASE}/kb/graduate-school-staff/files/private-staff-orientation-checklist`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
});

test("viewer mutation attempts are rejected with 403", async ({ context }) => {
  await addViewerCookie(context);
  const response = await context.request.post(`${BASE}/api/admin/redirects`, {
    headers: { Origin: BASE },
    data: { kbId: "kb-private-staff", fromPath: "old/blocked", toPath: "new/blocked" },
  });
  expect(response.status()).toBe(403);
});

test("viewer is redirected away from the admin shell", async ({ context }) => {
  await addViewerCookie(context);
  const page = await context.newPage();
  await page.goto("/admin");
  await expect(page).toHaveURL(`${BASE}/`);
});
