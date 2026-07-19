import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  validateAdminCredentials,
  type AdminSession,
} from "../../src/lib/auth";

const PUBLIC_ROUTES = [
  { name: "home", path: "/" },
  { name: "knowledge base landing", path: "/kb/graduate-school" },
  { name: "global search", path: "/search?q=fact" },
  { name: "search", path: "/kb/graduate-school/search?q=fact" },
];

for (const route of PUBLIC_ROUTES) {
  test(`${route.name} has no axe violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("main, .page-shell").first()).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}

test("home search widget is hidden by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("search")).toHaveCount(0);
});

test("tree group URLs render the not-found UI like missing article pages", async ({ context, page }) => {
  const [groupResponse, missingResponse] = await Promise.all([
    context.request.get(`${BASE}/kb/graduate-school/reference`),
    context.request.get(`${BASE}/kb/graduate-school/not-a-page`),
  ]);
  expect(groupResponse.status()).toBe(missingResponse.status());

  await page.goto("/kb/graduate-school/reference");
  await expect(page.getByRole("heading", { level: 1, name: /not found/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Reference");
  await expect(page.locator(".kb-search-widget")).toHaveCount(0);
});

test("article has no axe violations", async ({ page }) => {
  await page.goto("/kb/graduate-school");
  const articlePath = await page
    .locator('a[href^="/kb/graduate-school/"]')
    .evaluateAll((links) => {
      const hrefs = links
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => href && !href.includes("/search") && !href.includes("/files/"));
      return hrefs[0] ?? "";
    });

  expect(articlePath).not.toBe("");
  const response = await page.goto(articlePath);
  expect(response?.ok()).toBe(true);
  await expect(page.locator("main, .page-shell").first()).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("signed-in viewer can read a private article without axe violations", async ({ context, page }) => {
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

  const response = await page.goto("/kb/graduate-school-staff/private-staff-orientation");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Private Staff Orientation" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});
