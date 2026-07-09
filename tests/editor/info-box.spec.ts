import { expect, test } from "@playwright/test";
import {
  TARGET_PAGE_PUBLIC_PATH,
  insertInfoBox,
  openEditor,
  resetDocument,
  saveAndPublish,
  setDocumentHtml,
} from "./helpers";

// An Info box authored with bold text, a bulleted list, a numbered list, and a
// nested list. Exercises the sanitizeCalloutHtml pipeline end to end: block
// styles (headings) must be flattened while inline formatting and real
// <ul>/<ol>/<li> markup — including nesting — survive inside the callout.
const INFO_BOX_HTML = `
<p>Intro paragraph outside the info box.</p>
<aside class="doc-alert doc-alert--info" data-variant="info" role="note">
  <h2>Heading should be flattened, not preserved</h2>
  <p><strong>Important:</strong> read the following before you begin.</p>
  <ul>
    <li>First bullet</li>
    <li>Second bullet
      <ul>
        <li>Nested bullet</li>
      </ul>
    </li>
  </ul>
  <ol start="2">
    <li>First numbered step</li>
    <li>Second numbered step</li>
  </ol>
</aside>
`.trim();

test.describe("info box content", () => {
  // Task 3 (HTML source round-trip) + Task 1 (save & public render). Authoring
  // in source mode keeps the list-structure setup deterministic; switching back
  // to Visual runs the same documentHtmlToBlocks parse that a manual edit hits.
  test("nested-list info box survives the source round-trip, save, and public render", async ({
    page,
  }) => {
    await openEditor(page);
    await setDocumentHtml(page, INFO_BOX_HTML);

    // After the Visual round-trip the callout keeps semantic, nested lists and
    // drops the heading tag (its text is flattened inline).
    const editorCallout = page.locator(".wysiwyg-surface .doc-alert").first();
    await editorCallout.waitFor();
    await expect(editorCallout.locator("ul > li")).not.toHaveCount(0);
    await expect(editorCallout.locator("ol > li")).not.toHaveCount(0);
    await expect(editorCallout.locator("ul ul > li")).toContainText("Nested bullet");
    await expect(editorCallout.locator("strong")).toContainText("Important");
    await expect(editorCallout.locator("h2")).toHaveCount(0);

    await saveAndPublish(page);

    // Public render: content lives inside the colored info box (.alert--info)
    // as semantic list markup.
    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicCallout = page.locator("aside.alert--info").first();
    await publicCallout.waitFor();

    await expect(publicCallout.locator("strong")).toContainText("Important");
    await expect(publicCallout.locator("ul > li").first()).toContainText("First bullet");
    await expect(publicCallout.locator("ol > li").first()).toContainText("First numbered step");
    // The nested list is a real <ul> inside an <li>, not flattened or wrapped in
    // an inline-only container.
    await expect(publicCallout.locator("ul ul > li")).toContainText("Nested bullet");
    // Heading markup did not leak into the callout.
    await expect(publicCallout.locator("h2")).toHaveCount(0);
  });

  // Task 1 (toolbar-driven): create a bulleted list inside the Info box and nest
  // an item using the toolbar indent control. Drives the real contentEditable +
  // toolbar path (applyList + indentListItem) rather than source mode.
  test("toolbar builds a bulleted list and nests an item inside the info box", async ({ page }) => {
    await openEditor(page);
    await resetDocument(page);
    const callout = await insertInfoBox(page);

    // Select the placeholder line, then turn it into a bulleted list.
    await callout.click({ clickCount: 3 });
    await page.getByRole("button", { name: "Bulleted list" }).click();
    await expect(callout.locator("ul > li")).not.toHaveCount(0);

    // Add a second item, then nest it under the first with the indent control.
    const firstItem = callout.locator("li").first();
    await firstItem.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Nested item");
    await page.getByRole("button", { name: "Indent list item" }).click();

    await expect(callout.locator("ul ul > li")).toContainText("Nested item");
  });
});
