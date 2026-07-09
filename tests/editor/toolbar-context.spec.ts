import { expect, test } from "@playwright/test";
import { clickUntil, insertInfoBox, openEditor, resetDocument } from "./helpers";

// Covers the surface-aware toolbar (queryEditorFormatting -> surfaceKind ->
// DocumentToolbar). The toolbar collapses to context-appropriate controls when
// focus moves into an Info box (callout) or a table cell.
test.describe("toolbar context", () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);
  });

  test("Info box focus shows text + list tools and hides page-structure inserts", async ({ page }) => {
    // Select the callout's text so the caret is unambiguously inside the
    // callout and the toolbar recomputes context (a single click can land the
    // caret on the boundary, leaving the surface in document context).
    const callout = await insertInfoBox(page);
    await callout.click({ clickCount: 3 });

    // Context badge + list controls present.
    await expect(page.getByText("Info box: text and list tools only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bulleted list" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Numbered list" })).toBeVisible();

    // Text formatting stays available.
    await expect(page.getByRole("button", { name: "Bold" })).toBeVisible();

    // Page-structure block styles and insert controls are hidden.
    await expect(page.getByRole("button", { name: "Heading level 2" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Insert info box" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Insert divider" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Insert table" })).toHaveCount(0);
  });

  test("Table cell focus shows text-only tools and hides list + structure controls", async ({ page }) => {
    const cell = page.locator(".wysiwyg-table-cell").first();
    await clickUntil(page, "Insert table", async () => {
      await expect(cell).toBeVisible({ timeout: 2_000 });
    });

    // Focus the first editable table cell.
    await cell.click();

    await expect(page.getByText("Table cell: text tools only")).toBeVisible();

    // Text formatting stays available.
    await expect(page.getByRole("button", { name: "Bold" })).toBeVisible();

    // Lists and page-structure/insert controls are hidden in a table cell.
    await expect(page.getByRole("button", { name: "Bulleted list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Numbered list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Heading level 2" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Insert table" })).toHaveCount(0);
  });

  test("document body focus keeps page-structure and insert controls discoverable", async ({ page }) => {
    // Baseline: with the caret in the ordinary flow surface, the structural and
    // insert affordances (Divider, Procedure section, Info box) are present and
    // labeled.
    await page.locator(".wysiwyg-surface").first().click();

    await expect(page.getByRole("button", { name: "Heading level 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Insert divider" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Insert procedure section" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Insert info box" })).toBeVisible();
  });
});
