import { expect, test, type Page } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH } from "./helpers";

const KB_ID = "kb-grad-school";
const NAV = ".article-page-nav";

// Driven from inside the page rather than page.request: the admin session cookie lives in
// the browser context, and an APIRequestContext call does not carry it (the guard answers
// "Unauthorized"). An in-page fetch also sends a correct same-origin Origin for free.
async function setShowPageNav(page: Page, showPageNav: boolean) {
  await page.goto("/admin");
  const result = await page.evaluate(
    async ({ kbId, value }) => {
      const response = await fetch(`/api/admin/kbs/${kbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showPageNav: value }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { kbId: KB_ID, value: showPageNav },
  );
  expect(result.ok, `PATCH failed ${result.status}: ${result.body}`).toBe(true);
}

test.describe("previous/next article nav", () => {
  // Restore the default so the shared in-memory store is not left switched on for
  // whatever spec runs next.
  test.afterEach(async ({ page }) => {
    await setShowPageNav(page, false);
  });

  test("is off unless the knowledge base turns it on", async ({ page }) => {
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator(NAV)).toHaveCount(0);

    await setShowPageNav(page, true);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(NAV)).toHaveCount(1);
    await expect(page.locator(`${NAV} a`).first()).toBeVisible();

    await setShowPageNav(page, false);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(NAV)).toHaveCount(0);
  });

  // The /admin/kbs checkbox itself is not covered here: GET /api/admin/kbs returns an
  // empty list without a database (pre-existing), so that screen has no rows to edit in
  // this hermetic suite. The flag's storage, API, and public rendering are covered above.
});
