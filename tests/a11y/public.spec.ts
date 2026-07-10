import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
