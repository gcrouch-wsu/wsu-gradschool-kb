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

test.describe("keyboard list nesting", () => {
  test("Tab/Shift+Tab build and outdent a three-level ordered list; public preserves nesting", async ({
    page,
  }) => {
    await openEditor(page);
    await resetDocument(page);
    const surface = await makeOrderedList(page, ["One", "Two", "Three"]);

    // Nest "Two" under "One" (level 2).
    await itemExactly(surface, "Two").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");

    // Nest "Three" to level 3 in two steps. Re-focus the item between Tabs: the
    // indent reparents the <li>, which drops the caret, so a single burst of two
    // Tab presses would only nest once.
    await itemExactly(surface, "Three").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab"); // -> level 2 (sibling of "Two")
    await itemExactly(surface, "Three").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab"); // -> level 3 (nested under "Two")

    // Editor DOM has three nested <ol> levels.
    await expect(surface.locator("ol ol ol > li")).toHaveText(["Three"]);
    await expect(surface.locator("ol > li").first()).toContainText("One");

    // Shift+Tab outdents "Three" back to level 2.
    await itemExactly(surface, "Three").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Tab");
    await expect(surface.locator("ol ol ol")).toHaveCount(0);
    await expect(surface.locator("ol ol > li")).toHaveText(["Two", "Three"]);

    // Re-nest to three levels and publish.
    await itemExactly(surface, "Three").click();
    await page.keyboard.press("End");
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
    await itemExactly(surface, "Alpha").click();
    await page.keyboard.press("End");
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
