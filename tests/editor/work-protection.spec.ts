import { expect, test } from "@playwright/test";
import {
  TARGET_PAGE_EDITOR_PATH,
  TARGET_PAGE_ID,
  TARGET_PAGE_PUBLIC_PATH,
  openEditor,
  saveAndPublish,
  setDocumentHtml,
} from "./helpers";

test.describe("work protection and editor-only notes", () => {
  test("local draft backup restores body content and lifecycle metadata", async ({ page }) => {
    const backupSnapshot = {
      title: "Restored local draft title",
      slug: "procedures",
      summary: "Restored local draft summary.",
      visibility: "public",
      parentPath: "",
      ownerLabel: "Graduate School",
      contactEmail: "graduate.school@wsu.edu",
      lastReviewedDate: "2026-01-01",
      nextReviewDate: "2026-08-15",
      showToc: true,
      tocDepth: 3,
      showSummary: true,
      showPrintButton: true,
      blocks: [
        {
          blockId: "backup-paragraph",
          type: "paragraph",
          text: "Restored local draft body.",
          html: "Restored local draft body.",
        },
      ],
    };

    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: `kb-editor-backup:${TARGET_PAGE_ID}`,
        value: JSON.stringify({ savedAt: "2026-07-09T12:00:00.000Z", snapshot: JSON.stringify(backupSnapshot) }),
      },
    );

    await openEditor(page);
    await expect(page.getByText("Unsaved draft found.")).toBeVisible();
    await page.getByRole("button", { name: "Restore draft" }).click();

    await expect(page.getByLabel("Title")).toHaveValue("Restored local draft title");
    await expect(page.getByLabel("Next review date")).toHaveValue("2026-08-15");
    await expect(page.locator(".wysiwyg-surface").first()).toContainText("Restored local draft body.");

    await page.goto(TARGET_PAGE_EDITOR_PATH);
    await page.evaluate((key) => window.localStorage.removeItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`);
  });

  test("editor-only notes stay in the editor but are stripped from public pages and search", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      '<p>Public note anchor <span class="doc-note" data-note-id="note-e2e" data-note-body="reviewer-only-secret">text</span>.</p>',
    );

    await expect(page.locator(".wysiwyg-surface .doc-note")).toHaveAttribute(
      "data-note-body",
      "reviewer-only-secret",
    );

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article")).toContainText("Public note anchor text.");
    await expect(page.locator(".article .doc-note")).toHaveCount(0);
    await expect(page.locator(".article")).not.toContainText("reviewer-only-secret");

    await page.goto("/kb/graduate-school/search?q=reviewer-only-secret");
    await expect(page.getByText(/No results found for/)).toBeVisible();
    await expect(page.getByText("Public note anchor text.")).toHaveCount(0);
  });
});
