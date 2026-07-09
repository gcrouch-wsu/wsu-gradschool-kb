import { expect, test } from "@playwright/test";
import { openEditor, resetDocument, saveAndPublish } from "./helpers";

// Covers the FB-24 History panel on /admin/pages/[pageId]: a save records a
// revision, and previewing a revision must not flip that row's restore button
// into its busy ("Working…") state — view and restore track separate busy ids.
test.describe("revision history panel", () => {
  test("a save records a revision and viewing it leaves restore idle", async ({ page }) => {
    await openEditor(page);
    // Reset + save so there is a deterministic, freshly-created revision, and so
    // the editor is hydrated before we drive the panel.
    await resetDocument(page);
    await saveAndPublish(page);

    // The panel lists at least the revision the save just created.
    const firstRow = page.locator(".page-history__item").first();
    await expect(firstRow).toBeVisible();

    const restoreButton = firstRow.getByRole("button", { name: /restore this version|working/i });
    await expect(restoreButton).toHaveText("Restore this version");

    // Previewing opens the read-only Draft preview dialog and must NOT change the
    // restore button label/state on that row.
    await firstRow.getByRole("button", { name: /^(view|loading)/i }).click();
    await expect(page.getByRole("dialog", { name: "Draft preview" })).toBeVisible();
    await expect(restoreButton).toHaveText("Restore this version");
    await expect(restoreButton).toBeEnabled();

    await page.getByRole("button", { name: "Close preview" }).click();
    await expect(page.getByRole("dialog", { name: "Draft preview" })).toHaveCount(0);
  });

  test("a successful save clears a stale panel error", async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);
    await saveAndPublish(page);

    const firstRow = page.locator(".page-history__item").first();
    await expect(firstRow).toBeVisible();

    // Force the single-revision view request to fail so an error surfaces in the
    // panel's live region. The glob only matches …/revisions/<id> (a segment
    // after "revisions"), not the …/revisions list, so the list refetch still
    // succeeds.
    const viewGlob = "**/api/admin/pages/**/revisions/*";
    await page.route(viewGlob, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Boom" }) }),
    );
    await firstRow.getByRole("button", { name: /^(view|loading)/i }).click();
    const panelError = page.locator(".page-history__status .error");
    await expect(panelError).toBeVisible();
    await page.unroute(viewGlob);

    // A successful save bumps reloadToken; the panel resets to loading and clears
    // the stale error.
    await page.getByRole("button", { name: /save changes|save & publish/i }).first().click();
    await expect(panelError).toHaveCount(0);
  });
});
