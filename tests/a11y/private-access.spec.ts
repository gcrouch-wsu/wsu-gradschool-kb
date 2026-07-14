import { expect, test, type BrowserContext } from "@playwright/test";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  validateAdminCredentials,
  type AdminSession,
} from "../../src/lib/auth";

const BASE = "http://127.0.0.1:3000";

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
// committed before authorization runs: not-found pages render the 404 boundary
// UI with a 200 status, identically for nonexistent, private, and draft KBs.
// The security-relevant invariants are (a) the 404 UI renders, (b) no gated
// content appears, and (c) an unreadable KB is indistinguishable from a
// nonexistent one. Asset delivery is a route handler and returns a real 404.
async function expectNotFoundUi(page: import("@playwright/test").Page, path: string, hiddenText: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: /not found/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(hiddenText);
}

test("anonymous visitors get the not-found page for private KB routes and a 404 for assets", async ({
  context,
  page,
}) => {
  await expectNotFoundUi(page, "/kb/graduate-school-staff/private-staff-orientation", "Orientation");
  await expectNotFoundUi(page, "/kb/graduate-school-staff", "Staff Knowledge Base");

  const [privateResponse, nonexistentResponse] = await Promise.all([
    context.request.get(`${BASE}/kb/graduate-school-staff`),
    context.request.get(`${BASE}/kb/no-such-kb-parity-check`),
  ]);
  expect(privateResponse.status()).toBe(nonexistentResponse.status());

  const asset = await context.request.get(
    `${BASE}/kb/graduate-school-staff/files/private-staff-orientation-checklist`,
  );
  expect(asset.status()).toBe(404);
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
