import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH } from "./helpers";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

test.describe("PDF export", () => {
  test("waits for lazy article images before opening print", async ({ page }) => {
    let requestedDelayedImage = false;

    await page.route(/print-delayed-image\.png/, async (route) => {
      requestedDelayedImage = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        body: TINY_PNG,
        contentType: "image/png",
        status: 200,
      });
    });

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const exportButton = page.getByRole("button", { name: "Export PDF" });
    await expect(exportButton).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect
      .poll(async () => {
        await page.evaluate(() => {
          const article = document.querySelector(".article");
          if (!article) throw new Error("Article not found.");
          if (document.querySelector('.article img[alt="Delayed print image"]')) {
            return;
          }

          const image = document.createElement("img");
          image.alt = "Delayed print image";
          image.loading = "lazy";
          image.src = `/print-delayed-image.png?cache=${Date.now()}`;
          article.append(image);

          (window as unknown as { __printCalls: number }).__printCalls = 0;
          (window as unknown as { __printedWithImageComplete: boolean }).__printedWithImageComplete = false;
          window.print = () => {
            (window as unknown as { __printCalls: number }).__printCalls += 1;
            (window as unknown as { __printedWithImageComplete: boolean }).__printedWithImageComplete =
              image.complete && image.naturalWidth > 0;
          };
        });
        return page.locator('.article img[alt="Delayed print image"]').count();
      })
      .toBe(1);

    await exportButton.click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __printedWithImageComplete: boolean }).__printedWithImageComplete),
      )
      .toBe(true);
    expect(requestedDelayedImage).toBe(true);
  });
});
