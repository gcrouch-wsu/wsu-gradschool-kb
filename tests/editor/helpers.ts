import { expect, type Page } from "@playwright/test";

// Dev bootstrap credentials. When no KB_ADMIN_* env vars and no DATABASE_URL
// are set (the default for local/CI runs), `src/lib/auth.ts` accepts these and
// the content store falls back to the in-memory seed dataset — so the whole
// suite is hermetic and needs no external database.
export const ADMIN_EMAIL = process.env.KB_ADMIN_EMAIL?.trim() || "admin@example.edu";
export const ADMIN_PASSWORD = process.env.KB_ADMIN_PASSWORD?.trim() || "ChangeMe123!";

export const BASE_URL = "http://127.0.0.1:3000";
export const AUTH_STATE_PATH = "tests/editor/.auth/state.json";

// A published seed page (see src/lib/demo-data.ts). It already satisfies the
// publish gate (title, summary, responsible office, valid contact email,
// reviewed date), so tests can edit its content and re-publish without having
// to fill governance fields.
export const TARGET_PAGE_ID = "page-section-procedures";
export const TARGET_PAGE_PUBLIC_PATH = "/kb/graduate-school/procedures";
export const TARGET_PAGE_EDITOR_PATH = `/admin/pages/${TARGET_PAGE_ID}`;

// Open the editor and wait for the document editor + its first editable surface
// to be ready. The admin layout redirects to sign-in without a session cookie,
// so this assumes storageState from the `setup` project is loaded.
export async function openEditor(page: Page) {
  await page.goto(TARGET_PAGE_EDITOR_PATH);
  await page.getByRole("group", { name: "Editor mode" }).waitFor();
  await page.locator(".wysiwyg-surface").first().waitFor();
}

// Place the caret inside the first editable flow surface. Insert actions
// (info box, divider) restore the last editor selection, so an insert with no
// prior in-surface selection silently falls back and does not repaint the live
// contentEditable. Focusing first makes inserts land in the DOM.
export async function focusBody(page: Page) {
  await page.locator(".wysiwyg-surface").first().click();
}

// Click a toolbar/insert control until its expected result appears. The Next
// dev server can paint the (SSR) controls before React hydrates, so an early
// click is a no-op; retrying via toPass rides out that window without a fixed
// sleep. Kept side-effect-tolerant: each retry re-clicks, so callers should use
// it for idempotent-enough inserts within a fresh editor.
export async function clickUntil(page: Page, buttonName: string, appears: () => Promise<void>) {
  await expect(async () => {
    await page.getByRole("button", { name: buttonName }).first().click();
    await appears();
  }).toPass();
}

// Insert an Info box into the document body. Focuses the body first so the
// insert lands in the live DOM, then confirms the callout is present.
export async function insertInfoBox(page: Page) {
  await focusBody(page);
  const callout = page.locator(".wysiwyg-surface .doc-alert").first();
  await clickUntil(page, "Insert info box", async () => {
    await expect(callout).toBeVisible({ timeout: 2_000 });
  });
  return callout;
}

// Switch the document editor into HTML source mode and replace the whole
// document with `html`, then switch back to Visual so the content is re-parsed
// and sanitized through the real save pipeline (documentHtmlToBlocks).
export async function setDocumentHtml(page: Page, html: string) {
  const source = page.getByLabel("Document HTML source");
  await clickUntil(page, "</> HTML", async () => {
    await expect(source).toBeVisible({ timeout: 2_000 });
  });
  await source.fill(html);
  await page.getByRole("button", { name: "Visual", exact: true }).click();
  await page.locator(".wysiwyg-surface").first().waitFor();
}

// Reset the editor to a clean single-paragraph baseline. Tests run single-worker
// against one dev server with a process-global in-memory store, and one test
// publishes content — so resetting the in-editor document keeps each
// content-inserting test independent of what a prior test left behind, and
// makes `.first()` selectors point at the element the test itself creates.
export async function resetDocument(page: Page) {
  await setDocumentHtml(page, "<p>Placeholder body for editor tests.</p>");
}

// Persist the current draft and publish it. The target page is already
// published, so the primary button reads "Save changes"; a freshly-drafted page
// would read "Save & publish". Accept either. Waits for the server success
// banner so callers can safely navigate to the public URL afterwards.
export async function saveAndPublish(page: Page) {
  await page
    .getByRole("button", { name: /save changes|save & publish/i })
    .first()
    .click();
  await page.getByText(/Saved as/i).first().waitFor();
}
