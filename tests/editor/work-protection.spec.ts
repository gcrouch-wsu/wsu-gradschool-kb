import { expect, test } from "@playwright/test";
import {
  TARGET_PAGE_EDITOR_PATH,
  TARGET_PAGE_ID,
  TARGET_PAGE_PUBLIC_PATH,
  openEditor,
  resetDocument,
  saveAndPublish,
  setDocumentHtml,
} from "./helpers";

test.describe("work protection and editor-only notes", () => {
  // The restore test below seeds a backup and never writes one, so the write path had no
  // coverage — which is how a change that stopped arming work protection reached production
  // with a green suite. These two cover both directions of the gate.
  test("typing in the body arms work protection and writes a backup", async ({ page }) => {
    await openEditor(page);
    await page.evaluate((key) => window.localStorage.removeItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`);

    const surface = page.locator(".wysiwyg-surface").first();
    await surface.click();
    await page.keyboard.type("Recovery probe");

    // The backup is debounced; poll rather than sleep.
    await expect
      .poll(
        async () =>
          page.evaluate((key) => window.localStorage.getItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`),
        { timeout: 15_000 },
      )
      .not.toBeNull();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      `kb-editor-backup:${TARGET_PAGE_ID}`,
    );
    expect(stored).toContain("Recovery probe");

    await page.evaluate((key) => window.localStorage.removeItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`);
  });

  test("opening the HTML view without editing does not write a backup", async ({ page }) => {
    await openEditor(page);
    await page.evaluate((key) => window.localStorage.removeItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`);

    // The benign action that used to leave a recovery draft behind on pages nobody edited.
    await page.getByTitle("Edit the document HTML").click();
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await page.waitForTimeout(5000);

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      `kb-editor-backup:${TARGET_PAGE_ID}`,
    );
    expect(stored).toBeNull();
  });

  // Saving must disarm the edit flag. It previously stayed armed for the rest of the session,
  // so the next benign re-serialization wrote a fresh recovery draft immediately after a save —
  // "I deleted the drafts, saved the page, and see two draft warnings again".
  test("saving clears the unsaved indicator and does not immediately re-arm", async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);
    await page.evaluate((key) => window.localStorage.removeItem(key), `kb-editor-backup:${TARGET_PAGE_ID}`);

    const surface = page.locator(".wysiwyg-surface").first();
    await surface.click();
    await page.keyboard.type(" armed");
    await expect(page.locator(".unsaved-pill").first()).toBeVisible();

    await saveAndPublish(page);
    await expect(page.locator(".unsaved-pill")).toHaveCount(0);

    // Give the debounce longer than its 2s window to prove nothing re-arms on its own.
    await page.waitForTimeout(5000);
    await expect(page.locator(".unsaved-pill")).toHaveCount(0);
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      `kb-editor-backup:${TARGET_PAGE_ID}`,
    );
    expect(stored).toBeNull();
  });

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
