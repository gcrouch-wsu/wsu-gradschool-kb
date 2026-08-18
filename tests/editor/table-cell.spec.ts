import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, clickUntil, openEditor, resetDocument, saveAndPublish, setDocumentHtml } from "./helpers";

// FB-25/FB-26 table-cell authoring: text formatting and link insertion bind to
// the shared toolbar, page-structure/list controls stay hidden, and the cell
// content round-trips to the public page.
test.describe("table cell workflows", () => {
  test("bold in a table cell, structure controls hidden, and public render", async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);

    // Insert a table and focus a body cell (row 2, col 1 -> index 2).
    await clickUntil(page, "Insert table", async () => {
      await expect(page.locator(".wysiwyg-table-cell").first()).toBeVisible({ timeout: 2_000 });
    });
    const cell = page.locator(".wysiwyg-table-cell").nth(2);
    await cell.click();
    await page.keyboard.type("CellText");

    // Focus context is text-only: no list or page-structure controls.
    await expect(page.getByText("Table cell: text tools only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bulleted list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Numbered list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Heading level 2" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Insert table" })).toHaveCount(0);

    // Bold the cell text (Ctrl+A selects within the focused cell).
    await cell.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(cell.locator("b, strong")).toHaveText("CellText");

    await saveAndPublish(page);

    // Public page renders the cell content inside a real table, bold preserved.
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicCell = page.locator("table td").filter({ hasText: "CellText" }).first();
    await expect(publicCell).toBeVisible();
    await expect(publicCell.locator("b, strong").first()).toHaveText("CellText");
    await expect(page.locator("table th").first()).toHaveAttribute("scope", "col");
  });

  // Regression for the table-cell link bug: previously the link-draft marker was
  // stripped when the dialog blurred the cell (the cell re-serialized its DOM),
  // so the link was dropped or the text duplicated. It must now land exactly once.
  test("link insertion in a table cell round-trips to the public page exactly once", async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);

    await clickUntil(page, "Insert table", async () => {
      await expect(page.locator(".wysiwyg-table-cell").first()).toBeVisible({ timeout: 2_000 });
    });
    const cell = page.locator(".wysiwyg-table-cell").nth(2);
    await cell.click();
    await page.keyboard.type("Linktext");

    // Text-only context is preserved even while linking (no list/structure tools).
    await expect(page.getByText("Table cell: text tools only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bulleted list" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Heading level 2" })).toHaveCount(0);

    // Select the cell text and insert a link via the dialog.
    await cell.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Insert or edit link" }).click();
    const dialog = page.getByRole("dialog", { name: /insert link|edit link/i });
    await dialog.getByLabel("URL").fill("https://wsu.edu");
    await dialog.getByRole("button", { name: "Insert link" }).click();

    // Exactly one anchor in the cell, wrapping the text (no duplication).
    await expect(cell.locator("a")).toHaveCount(1);
    await expect(cell.locator("a")).toHaveAttribute("href", "https://wsu.edu");
    await expect(cell.locator("a")).toHaveText("Linktext");
    await expect(cell).toHaveText("Linktext");

    await saveAndPublish(page);

    // Public table cell contains the anchor exactly once.
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicCell = page.locator("table td").filter({ hasText: "Linktext" }).first();
    await expect(publicCell.locator("a")).toHaveCount(1);
    await expect(publicCell.locator("a")).toHaveAttribute("href", "https://wsu.edu");
    await expect(publicCell).toHaveText("Linktext");
  });

  test("focused table rows and columns can be reordered", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<p>Table intro.</p>` +
        `<table class="doc-table" data-block-id="table-move-test" data-header-row="true" data-header-column="false">` +
        `<tbody><tr><th>A1</th><th>B1</th></tr><tr><td>A2</td><td>B2</td></tr></tbody>` +
        `</table>`,
    );

    const cells = page.locator(".wysiwyg-table-cell");
    await expect(cells.nth(0)).toHaveText("A1");
    await expect(cells.nth(2)).toHaveText("A2");

    await cells.nth(2).click();
    await page.getByRole("button", { name: "Move selected row up" }).click();

    await expect(cells.nth(0)).toHaveText("A2");
    await expect(cells.nth(1)).toHaveText("B2");
    await expect(cells.nth(2)).toHaveText("A1");
    await expect(cells.nth(3)).toHaveText("B1");

    await page.getByRole("button", { name: "Move selected column right" }).click();

    await expect(cells.nth(0)).toHaveText("B2");
    await expect(cells.nth(1)).toHaveText("A2");
    await expect(cells.nth(2)).toHaveText("B1");
    await expect(cells.nth(3)).toHaveText("A1");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article table tr").nth(0)).toContainText("B2");
    await expect(page.locator(".article table tr").nth(0)).toContainText("A2");
    await expect(page.locator(".article table tr").nth(1)).toContainText("B1");
    await expect(page.locator(".article table tr").nth(1)).toContainText("A1");
  });
});
