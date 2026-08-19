import { expect, test, type Page } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const SECTION_BREAK_HTML =
  '<div class="doc-section-break" contenteditable="false" data-block-id="format-break" role="separator" aria-label="Section break"></div>';

// Largest scrollTop across the document and any scrolling container. The admin
// shell has scrolled ancestors, so `window.scrollY` alone can read 0 while the
// editor pane is scrolled well down the page.
async function editorScrollTop(page: Page) {
  return page.evaluate(() => {
    const values = [document.scrollingElement?.scrollTop ?? 0];
    document.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.scrollHeight > element.clientHeight) {
        values.push(element.scrollTop);
      }
    });
    return Math.max(...values);
  });
}

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

  // A document with more than one flow surface is the case that broke: every
  // surface registers with the shared toolbar bridge, and a re-render used to
  // hand ownership back to the first surface on the page. Toolbar commands then
  // targeted the wrong editor — the click did nothing where the caret was.
  test("toolbar styles apply to the focused text box, not the first one", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      '<p data-block-id="format-top">Top box text</p>' +
        SECTION_BREAK_HTML +
        '<p data-block-id="format-bottom">Bottom box text</p>',
    );

    const surfaces = page.locator(".wysiwyg-surface");
    await expect(surfaces).toHaveCount(2);

    const bottomSurface = surfaces.nth(1);
    const bottomParagraph = bottomSurface.locator("p").filter({ hasText: "Bottom box text" }).first();
    await bottomParagraph.click();
    await page.keyboard.press("ControlOrMeta+a");

    await page.getByRole("button", { name: "Bold" }).click();
    await page.getByRole("button", { name: "Italic" }).click();
    await page.getByRole("button", { name: "Underline" }).click();

    await expect(bottomParagraph.locator("strong, b")).toHaveText("Bottom box text");
    await expect(bottomParagraph.locator(".doc-em")).toHaveText("Bottom box text");
    await expect(bottomParagraph.locator(".doc-u, u")).toHaveText("Bottom box text");
    await expect(surfaces.nth(0).locator("strong, b, .doc-em, .doc-u")).toHaveCount(0);
  });

  // Typing re-renders the editor. Before the fix that re-render silently moved
  // the shared toolbar target to the first surface, so the *next* toolbar click
  // formatted nothing (or the wrong box).
  test("styles still apply after typing in a lower text box", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      '<p data-block-id="format-typed-top">Top box text</p>' +
        SECTION_BREAK_HTML +
        '<p data-block-id="format-typed-bottom">Bottom</p>',
    );

    const surfaces = page.locator(".wysiwyg-surface");
    await expect(surfaces).toHaveCount(2);
    const bottomSurface = surfaces.nth(1);
    const bottomParagraph = bottomSurface.locator("p").first();

    await bottomParagraph.click();
    await page.keyboard.type(" box text");
    await expect(bottomParagraph).toHaveText("Bottom box text");

    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Bold" }).click();

    await expect(bottomParagraph.locator("strong, b")).toHaveText("Bottom box text");
    await expect(surfaces.nth(0).locator("strong, b")).toHaveCount(0);
  });

  // Formatting must not scroll the editor back to the top, and the caret must
  // stay where the user left it so they can keep typing.
  test("formatting below the fold keeps the viewport and the caret in place", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      Array.from({ length: 70 }, (_, index) => `<p>Filler editor line ${index + 1}</p>`).join("") +
        SECTION_BREAK_HTML +
        '<p data-block-id="format-deep">Deep paragraph</p>',
    );

    const surfaces = page.locator(".wysiwyg-surface");
    await expect(surfaces).toHaveCount(2);
    const target = surfaces.nth(1).locator("p").filter({ hasText: "Deep paragraph" }).first();
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.keyboard.press("ControlOrMeta+a");

    const before = await editorScrollTop(page);
    expect(before).toBeGreaterThan(200);

    // At narrow widths the toolbar is deliberately not sticky (it would eat the
    // viewport), so reaching it genuinely scrolls the page. Only assert the
    // viewport is preserved where the toolbar is in reach without scrolling.
    const toolbarIsSticky = await page
      .locator(".editor-toolbar-sticky")
      .evaluate((element) => getComputedStyle(element).position === "sticky");

    await page.getByRole("button", { name: "Bold" }).click();
    await expect(target.locator("strong, b")).toHaveText("Deep paragraph");

    if (toolbarIsSticky) {
      await expect
        .poll(() => editorScrollTop(page), { timeout: 5_000 })
        .toBeGreaterThan(before - 150);
    }

    // The caret survives the format, so typing continues in the same box.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("!");
    await expect(target).toHaveText("Deep paragraph!");
  });
});
