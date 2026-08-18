import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

test.describe("rich text formatting", () => {
  test("color and combined bold/italic formatting preserve selected text", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, '<p data-block-id="format-p">Format me</p>');

    const paragraph = page.locator(".wysiwyg-surface p").filter({ hasText: "Format me" }).first();
    await paragraph.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.getByRole("button", { name: "Italic" }).click();
    await page.getByRole("button", { name: "Text color: Crimson" }).click();

    await expect(paragraph).toHaveText("Format me");
    await expect(paragraph.locator("strong, b")).toHaveText("Format me");
    await expect(paragraph.locator(".doc-em")).toHaveText("Format me");
    await expect(paragraph.locator('[style*="color"]')).toHaveText("Format me");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicParagraph = page.locator(".article p").filter({ hasText: "Format me" }).first();
    await expect(publicParagraph).toHaveText("Format me");
    await expect(publicParagraph.locator("strong")).toHaveText("Format me");
    await expect(publicParagraph.locator("em")).toHaveText("Format me");
    await expect(publicParagraph.locator('span[style*="color"]')).toHaveText("Format me");
  });
});
