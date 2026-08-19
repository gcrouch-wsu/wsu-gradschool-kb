import { expect, test, type Page } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

// Mimics a clipboard screenshot landing on a specific element (the empty image
// box), not on the text surface — that is the whole point of the paste slot.
async function pastePngOnto(page: Page, selector: string) {
  await page.evaluate(
    ({ base64, target }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([bytes], "clipboard-screenshot.png", { type: "image/png" }));
      const element = document.querySelector(target);
      if (!element) {
        throw new Error(`Missing paste target: ${target}`);
      }
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer }),
      );
    },
    { base64: TEST_PNG_BASE64, target: selector },
  );
}

test.describe("paste-slot image boxes", () => {
  test("Paste image tab adds an empty box that blocks publish until a screenshot fills it", async ({
    page,
    browserName,
  }) => {
    // Firefox does not expose files added to a constructed DataTransfer on a
    // synthesized ClipboardEvent, so the paste half of this flow cannot be
    // driven there. The same limit already gates image-alt.spec.ts's paste test.
    test.skip(browserName === "firefox", "Synthesized clipboard files are not delivered in Firefox.");
    await openEditor(page);
    await setDocumentHtml(page, "<p>Intro paragraph for the paste slot test.</p>");

    await page.getByRole("button", { name: "Insert image or video" }).first().click();
    await page.getByRole("tab", { name: "Paste image" }).click();
    await page.getByRole("button", { name: "Add paste box" }).click();

    const pasteSlot = page.locator(".image-section-editor--paste-slot");
    await expect(pasteSlot).toHaveCount(1);
    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(0);

    // The readiness panel must name the blocker the server gate will raise,
    // rather than reporting the page ready and 422-ing on publish.
    const readiness = page.locator(".editor-readiness");
    await expect(readiness).toContainText("An image box is empty");

    await pastePngOnto(page, ".image-section-editor--paste-slot");

    // Filled in place: one real figure, no leftover slot, no duplicate section.
    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(page.locator(".image-section-editor--paste-slot")).toHaveCount(0);
    await expect(page.locator(".wysiwyg-surface figure.doc-image")).toHaveCount(0);
    await expect(readiness).not.toContainText("An image box is empty");

    const imageEditor = page.locator(".image-section-editor").first();
    await imageEditor.locator("figure.doc-image").click();
    await imageEditor.getByRole("button", { name: "Edit image alt text" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit image alt text" });
    await dialog.getByLabel("Describe the image for screen readers").fill("Pasted screenshot");
    await dialog.getByRole("button", { name: "Save alt text" }).click();
    await expect(readiness).toContainText("No accessibility or governance blockers");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article figure.content-image")).toHaveCount(1);
    await expect(page.locator(".article figure.content-image img")).toHaveAttribute(
      "alt",
      "Pasted screenshot",
    );
  });
});

test.describe("adjacent text boxes", () => {
  test("Insert Text creates a separate box that stays separate and can move to the top", async ({
    page,
  }) => {
    await openEditor(page);
    await setDocumentHtml(page, '<p data-block-id="first-box">First box</p>');

    const firstEditor = page.locator(".block-editor").first();
    const rowAfterFirst = firstEditor.locator(
      "xpath=following-sibling::*[contains(concat(' ', normalize-space(@class), ' '), ' block-insert-row ')][1]",
    );
    await rowAfterFirst.getByRole("button", { name: "Insert text here" }).click();

    const surfaces = page.locator(".wysiwyg-surface");
    await expect(surfaces).toHaveCount(2);

    const secondSurface = surfaces.nth(1);
    await secondSurface.click();
    await page.keyboard.type("Second box");
    await expect(secondSurface).toContainText("Second box");
    // Typing must not merge the two boxes back into one flow.
    await expect(surfaces).toHaveCount(2);
    await expect(surfaces.nth(0)).not.toContainText("Second box");

    const secondEditor = page.locator(".block-editor").filter({ hasText: "Second box" }).first();
    await secondEditor.locator(".block-bar").getByTitle("Move up").click();

    await expect
      .poll(async () =>
        page
          .locator(".wysiwyg-surface")
          .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim())),
      )
      .toEqual(["Second box", "First box"]);

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const second = page.locator(".article > p").filter({ hasText: "Second box" }).first();
    await expect(second).toBeVisible();
    await expect(second.locator("xpath=following-sibling::*[1]")).toHaveText("First box");
  });
});
