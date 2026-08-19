import { expect, test, type Page } from "@playwright/test";
import { openEditor, setDocumentHtml } from "./helpers";

// Lexical attaches its own paste listener to the editor root. A second DOM listener on
// that same element could not suppress it — preventDefault() does not stop a sibling
// listener — so rich content was inserted twice, once by each handler. Paste now goes
// through PASTE_COMMAND at CRITICAL priority instead.
async function pasteHtml(page: Page, html: string, plain: string) {
  await page.evaluate(
    ({ h, p }) => {
      const dt = new DataTransfer();
      dt.setData("text/html", h);
      dt.setData("text/plain", p);
      const surface = document.querySelector(".wysiwyg-surface");
      if (!surface) throw new Error("no editor surface");
      surface.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
      );
    },
    { h: html, p: plain },
  );
}

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

test.describe("paste", () => {
  // Firefox's ClipboardEvent constructor ignores the clipboardData init member, so a
  // synthesized paste arrives with nothing attached — the plain-text case fails there too,
  // and that path is pure Lexical. Same limitation already gates the image paste specs.
  test.skip(
    ({ browserName }) => browserName === "firefox",
    "Synthesized clipboard payloads are not delivered in Firefox.",
  );

  test("rich HTML paste inserts the content exactly once", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, "<p>anchor</p>");

    const surface = page.locator(".wysiwyg-surface").first();
    await surface.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ArrowRight");

    await pasteHtml(page, "<p>PastedAlpha</p><p>PastedBeta</p>", "PastedAlpha\nPastedBeta");

    await expect
      .poll(async () => occurrences((await surface.textContent()) ?? "", "PastedAlpha"))
      .toBe(1);
    expect(occurrences((await surface.textContent()) ?? "", "PastedBeta")).toBe(1);
  });

  test("pasted formatting is kept and still inserted once", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, "<p>anchor</p>");

    const surface = page.locator(".wysiwyg-surface").first();
    await surface.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ArrowRight");

    await pasteHtml(page, "<p><b>BoldPasted</b> and <i>ItalicPasted</i></p>", "BoldPasted and ItalicPasted");

    await expect
      .poll(async () => occurrences((await surface.textContent()) ?? "", "BoldPasted"))
      .toBe(1);
    expect(occurrences((await surface.textContent()) ?? "", "ItalicPasted")).toBe(1);
    await expect(surface.locator("strong, b").filter({ hasText: "BoldPasted" })).toHaveCount(1);
  });

  test("plain-text paste still inserts once", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, "<p>anchor</p>");

    const surface = page.locator(".wysiwyg-surface").first();
    await surface.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ArrowRight");

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "PlainGamma");
      document
        .querySelector(".wysiwyg-surface")!
        .dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    });

    await expect
      .poll(async () => occurrences((await surface.textContent()) ?? "", "PlainGamma"))
      .toBe(1);
  });
});
