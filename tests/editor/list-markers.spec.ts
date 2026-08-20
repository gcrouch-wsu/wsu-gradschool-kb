import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

// Per-KB marker styling is stored on the KB theme, which only persists with a database, so
// this asserts the rendering half: the ::marker rule is live and driven by the theme's CSS
// variables. Theme normalisation and the variables themselves are unit-tested in
// src/lib/kb-theme.test.ts.
test.describe("list marker styling", () => {
  test("::marker is driven by the theme variables on the public page and in the editor", async ({
    page,
  }) => {
    await openEditor(page);
    await setDocumentHtml(page, '<ol data-block-id="mk-1"><li>Marker one</li><li>Marker two</li></ol>');

    const editorMarker = await page.locator(".wysiwyg-surface li").first().evaluate((li) => {
      const before = getComputedStyle(li, "::marker").fontWeight;
      (li.closest(".page-document-editor") as HTMLElement).style.setProperty(
        "--list-marker-weight",
        "700",
      );
      return { before, after: getComputedStyle(li, "::marker").fontWeight };
    });
    expect(editorMarker.before).toBe("400");
    expect(editorMarker.after).toBe("700");

    await saveAndPublish(page);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);

    const publicMarker = await page.locator(".article ol li").first().evaluate((li) => {
      const before = getComputedStyle(li, "::marker");
      const root = li.closest(".article") as HTMLElement;
      root.style.setProperty("--list-marker-color", "rgb(166, 15, 45)");
      root.style.setProperty("--list-marker-size", "1.5em");
      const after = getComputedStyle(li, "::marker");
      return {
        beforeWeight: before.fontWeight,
        afterColor: after.color,
        afterSize: after.fontSize,
      };
    });
    expect(publicMarker.beforeWeight).toBe("400");
    expect(publicMarker.afterColor).toBe("rgb(166, 15, 45)");
    // 1.5em against the 16px default body size.
    expect(parseFloat(publicMarker.afterSize)).toBeGreaterThan(20);
  });
});
