import { expect, test, type Page } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, resetDocument, saveAndPublish } from "./helpers";

// Build a single-level ordered list with the given items using real editor
// interactions (type + toolbar "Numbered list" + Enter between items).
async function makeOrderedList(page: Page, items: string[]) {
  const surface = page.locator(".wysiwyg-surface").first();
  await surface.click({ clickCount: 3 });
  await page.keyboard.type(items[0]);
  await page.getByRole("button", { name: "Numbered list" }).click();
  await expect(surface.locator("ol > li")).toHaveCount(1);
  for (const item of items.slice(1)) {
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(item);
  }
  await expect(surface.locator("ol > li")).toHaveCount(items.length);
  return surface;
}

// Place the caret at the end of the list item whose full text is exactly `text`.
function itemExactly(surface: ReturnType<Page["locator"]>, text: string) {
  return surface.locator("li").filter({ hasText: new RegExp(`^${text}$`) }).first();
}

// Click into a list item and wait until the editor selection is genuinely inside it.
//
// A bare click().press("End") is not enough: on a slow runner the click can land before the
// contentEditable surface is ready to take a selection, and the caret stays wherever typing
// left it. The next Tab then indents the wrong item — which surfaced as "expected Two, got
// Three" and, before this test asserted intermediate levels, as a mystery missing third level.
async function caretInItem(page: Page, surface: ReturnType<Page["locator"]>, text: string) {
  const item = itemExactly(surface, text);
  await expect(async () => {
    await item.click();
    const inItem = await page.evaluate((want) => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const node = selection.getRangeAt(0).commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const li = element?.closest("li");
      return (li?.textContent ?? "").trim() === want;
    }, text);
    expect(inItem).toBe(true);
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press("End");
}

test.describe("keyboard list nesting", () => {
  test("Tab/Shift+Tab build and outdent a three-level ordered list; public preserves nesting", async ({
    page,
  }) => {
    await openEditor(page);
    await resetDocument(page);
    const surface = await makeOrderedList(page, ["One", "Two", "Three"]);

    // Nest "Two" under "One" (level 2).
    await caretInItem(page, surface, "Two");
    await page.keyboard.press("Tab");
    // Wait for each indent to land before touching the list again. An indent reparents the
    // <li> and triggers a re-render; clicking back into the list mid-reconciliation leaves
    // the next Tab acting on a stale selection and the level is silently never added. The
    // rest of this test already asserts between interactions, which is why only this stretch
    // was flaky — and only on CI, whose runners are slow enough to widen the window.
    await expect(surface.locator("ol ol > li")).toHaveText(["Two"]);

    // Nest "Three" to level 3 in two steps. Re-focus the item between Tabs: the
    // indent reparents the <li>, which drops the caret, so a single burst of two
    // Tab presses would only nest once.
    await caretInItem(page, surface, "Three");
    await page.keyboard.press("Tab"); // -> level 2 (sibling of "Two")
    await expect(surface.locator("ol ol > li")).toHaveText(["Two", "Three"]);
    await caretInItem(page, surface, "Three");
    await page.keyboard.press("Tab"); // -> level 3 (nested under "Two")

    // Editor DOM has three nested <ol> levels.
    await expect(surface.locator("ol ol ol > li")).toHaveText(["Three"]);
    await expect(surface.locator("ol > li").first()).toContainText("One");

    // Shift+Tab outdents "Three" back to level 2.
    await caretInItem(page, surface, "Three");
    await page.keyboard.press("Shift+Tab");
    await expect(surface.locator("ol ol ol")).toHaveCount(0);
    await expect(surface.locator("ol ol > li")).toHaveText(["Two", "Three"]);

    // Re-nest to three levels and publish.
    await caretInItem(page, surface, "Three");
    await page.keyboard.press("Tab");
    await expect(surface.locator("ol ol ol > li")).toHaveText(["Three"]);

    await saveAndPublish(page);

    // Public render preserves the nested ordered lists as real <ol>/<li>.
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator("ol > li").first()).toContainText("One");
    await expect(page.locator("ol ol > li").first()).toContainText("Two");
    await expect(page.locator("ol ol ol li").filter({ hasText: /^Three$/ })).toBeVisible();

    const listStyles = await page.locator(".article ol").evaluateAll((lists) =>
      lists.slice(0, 3).map((list) => window.getComputedStyle(list).listStyleType),
    );
    expect(listStyles).toEqual(["decimal", "lower-alpha", "lower-roman"]);
  });

  test("indent on the first item and outdent at the top level explain why they are blocked", async ({
    page,
  }) => {
    await openEditor(page);
    await resetDocument(page);
    const surface = await makeOrderedList(page, ["Alpha", "Beta"]);

    // First-item indent: nothing to nest under, so it explains rather than acts.
    await caretInItem(page, surface, "Alpha");
    await page.getByRole("button", { name: "Indent list item" }).click();
    await expect(page.locator(".editor-format-hint")).toContainText(/item 2 or later/i);
    // The list is unchanged (still two top-level items, no nesting).
    await expect(surface.locator("ol > li")).toHaveCount(2);
    await expect(surface.locator("ol ol")).toHaveCount(0);

    // Top-level outdent: already at the outermost level, so it explains.
    await page.getByRole("button", { name: "Outdent list item" }).click();
    await expect(page.locator(".editor-format-hint")).toContainText(/already at the top level/i);
    await expect(surface.locator("ol > li")).toHaveCount(2);
  });
});
