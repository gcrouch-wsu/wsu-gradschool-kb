import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const TINY_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='20'%3E%3Crect width='40' height='20' fill='%23eee'/%3E%3C/svg%3E";

test.describe("list numbering and nesting display", () => {
  // Lexical wraps a nested list in a structural <li> of its own. Sharing the normal item
  // class made that wrapper paint an empty "2." in the editor that the published page
  // never showed, so the editor and the reader disagreed about the numbering.
  test("the nested-list wrapper paints no marker and does not consume a number", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      '<ol data-block-id="nest-1"><li>One<ul><li>sub a</li><li>sub b</li></ul></li><li>Two</li><li>Three</li></ol>',
    );

    const surface = page.locator(".wysiwyg-surface").first();
    const topLevel = await surface.evaluate((root) =>
      Array.from(root.querySelectorAll(":scope > ol > li")).map((li) => ({
        nested: li.classList.contains("doc-li--nested"),
        value: li.getAttribute("value"),
        listStyle: getComputedStyle(li).listStyleType,
      })),
    );

    const wrapper = topLevel.find((item) => item.nested);
    expect(wrapper, "expected a nested-list wrapper item").toBeTruthy();
    expect(wrapper!.listStyle).toBe("none");

    // The visible items still read 1, 2, 3 — the wrapper does not take a number.
    expect(topLevel.filter((item) => !item.nested).map((item) => item.value)).toEqual(["1", "2", "3"]);

    await saveAndPublish(page);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicList = page.locator(".article ol").first();
    await expect(publicList.locator("> li")).toHaveCount(3);
    await expect(publicList.locator("> li").first().locator("ul > li")).toHaveCount(2);
  });

  // Two lists separated by an image live in different editor sections, so the sibling walk
  // that auto-continues numbering cannot see across them and the second list restarts at 1.
  test("Continue from previous list renumbers across an image and persists", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      '<ol data-block-id="num-1"><li>Step one</li><li>Step two</li><li>Step three</li></ol>' +
        `<figure class="doc-image" data-block-id="num-img" data-width="100" data-align="left">` +
        `<img alt="Screenshot" src="${TINY_SVG}" /></figure>` +
        '<ol data-block-id="num-2"><li>Step four</li><li>Step five</li></ol>',
    );

    const secondList = page.locator(".wysiwyg-surface ol").last();
    await expect(secondList).not.toHaveAttribute("start", /.+/);
    await secondList.locator("li").first().click();

    // Visible in the toolbar itself: no popover to discover first.
    const continueButton = page.getByRole("button", { name: /Continue numbering from the previous list/ });
    await expect(continueButton).toBeVisible();
    await expect(continueButton).toHaveText("Continue 4");
    await continueButton.click();

    await expect(secondList).toHaveAttribute("start", "4");

    await saveAndPublish(page);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    // The start must reach the reader, not just the editor DOM.
    await expect(page.locator(".article ol").last()).toHaveAttribute("start", "4");
  });

  test("Continue from previous list is not offered without an earlier list", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, '<ol data-block-id="only-1"><li>Only one</li><li>Only two</li></ol>');

    await page.locator(".wysiwyg-surface ol li").first().click();
    await expect(page.getByRole("button", { name: /Continue numbering/ })).toHaveCount(0);
  });

  // The "Starts at" box wrote the attribute straight onto the <ol>. Lexical renders that
  // element from its own state and saves from that state, so the number was visible until
  // the next reconcile and never reached the saved page.
  test("Starts at persists through save to the public page", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(page, '<ol data-block-id="starts-1"><li>Item A</li><li>Item B</li></ol>');

    await page.locator(".wysiwyg-surface ol li").first().click();
    await page.getByRole("button", { name: "Numbered list settings" }).click();
    const startInput = page.getByRole("spinbutton");
    await startInput.fill("7");
    await startInput.press("Enter");

    await expect(page.locator(".wysiwyg-surface ol").first()).toHaveAttribute("start", "7");

    await saveAndPublish(page);
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article ol").first()).toHaveAttribute("start", "7");
  });
});
