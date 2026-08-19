import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const TEST_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='320' viewBox='0 0 640 320'%3E%3Crect width='640' height='320' fill='%23f6f3f0'/%3E%3Crect x='32' y='32' width='576' height='256' fill='%23fff' stroke='%23a60f2d' stroke-width='8'/%3E%3C/svg%3E";
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const TEST_PNG_BYTES = Buffer.from(TEST_PNG_BASE64, "base64");

async function pasteTestPng(page: Page) {
  await page.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], "pasted-image.png", { type: "image/png" }));
    const surface = document.querySelector(".wysiwyg-surface");
    if (!surface) {
      throw new Error("Missing editor surface.");
    }
    surface.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }),
    );
  }, TEST_PNG_BASE64);
}

async function editorScrollTop(page: Page) {
  return page.evaluate(() => {
    const values = [document.scrollingElement?.scrollTop ?? 0];
    document.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.scrollHeight > element.clientHeight) {
        values.push(element.scrollTop);
      }
    });
    return Math.max(...values);
  });
}

test.describe("image alt text workflow", () => {
  test("text can be added above an image at the top of the page", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<figure class="doc-image" data-block-id="img-top-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="Test screenshot" />` +
        `</figure>`,
    );

    await expect(page.locator(".image-section-editor figure.doc-image")).toBeVisible();
    await expect(page.locator(".lexical-preserved-block figure.doc-image")).toHaveCount(0);

    const firstParagraph = page.locator(".wysiwyg-surface p").first();
    await expect(firstParagraph).toBeVisible();
    await firstParagraph.click();
    await page.keyboard.type("Intro above the image.");

    const firstBlock = page.locator(".wysiwyg-surface > *").first();
    await expect(firstBlock).toHaveText("Intro above the image.");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicIntro = page.locator(".article > p").filter({ hasText: "Intro above the image." }).first();
    await expect(publicIntro).toBeVisible();
    await expect(
      publicIntro.locator("xpath=following-sibling::*[1][self::figure[contains(@class, 'content-image')]]"),
    ).toBeVisible();
  });

  test("selected image can be moved down within the page body", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<figure class="doc-image" data-block-id="img-move-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="Test screenshot" />` +
        `</figure>` +
        `<p>Paragraph after the image.</p>`,
    );

    const figure = page.locator(".image-section-editor figure.doc-image").first();
    const imageEditor = page.locator(".image-section-editor").first();
    await figure.click();
    await expect(imageEditor.getByRole("button", { name: "Move image down" })).toBeEnabled();
    await imageEditor.getByRole("button", { name: "Move image down" }).click();

    await expect
      .poll(async () => {
        const order = await page.locator(".block-editor").evaluateAll((nodes) =>
          nodes.map((node) => {
            if (node.querySelector("figure.doc-image")) return "image";
            const text = node.textContent ?? "";
            if (text.includes("Paragraph after the image.")) return "paragraph";
            return "other";
          }),
        );
        const meaningful = order.filter((item) => item === "image" || item === "paragraph");
        return meaningful.join(",");
      })
      .toBe("paragraph,image");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicParagraph = page.locator(".article > p").filter({ hasText: "Paragraph after the image." }).first();
    await expect(publicParagraph).toBeVisible();
    await expect(
      publicParagraph.locator("xpath=following-sibling::*[1][self::figure[contains(@class, 'content-image')]]"),
    ).toBeVisible();
  });

  test("selected image width persists to the public page", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<figure class="doc-image" data-block-id="img-width-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="Test screenshot" />` +
        `</figure>`,
    );

    const figure = page.locator(".image-section-editor figure.doc-image").first();
    const imageEditor = page.locator(".image-section-editor").first();
    await saveAndPublish(page);
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await figure.click();
    await imageEditor.getByRole("button", { name: "Shrink image" }).click();
    await imageEditor.getByRole("button", { name: "Shrink image" }).click();

    await expect(figure).toHaveAttribute("data-width", "50");
    await expect(page.getByText("Unsaved changes").first()).toBeVisible();

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicFigure = page.locator(".article figure.content-image").first();
    const publicImage = publicFigure.locator("img");
    await expect(publicFigure).toBeVisible();
    await expect.poll(() => publicFigure.evaluate((element) => (element as HTMLElement).style.width)).toBe("50%");
    await expect
      .poll(async () => {
        const [figureWidth, imageWidth] = await Promise.all([
          publicFigure.evaluate((element) => element.getBoundingClientRect().width),
          publicImage.evaluate((element) => element.getBoundingClientRect().width),
        ]);
        return Math.abs(figureWidth - imageWidth);
      })
      .toBeLessThan(1);
  });

  test("Alt dialog updates editor image metadata and public render", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<figure class="doc-image" data-block-id="img-alt-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="" />` +
        `</figure>`,
    );

    const figure = page.locator(".image-section-editor figure.doc-image").first();
    const imageEditor = page.locator(".image-section-editor").first();
    await expect(figure).toBeVisible();
    await expect(figure).toHaveAttribute("data-needs-alt", "true");

    await figure.click();
    await imageEditor.getByRole("button", { name: "Edit image alt text" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit image alt text" });
    await dialog.getByLabel("Describe the image for screen readers").fill("One-pixel test image");
    await dialog.getByLabel("Visible caption (optional)").fill("Tiny image caption");
    await dialog.getByRole("button", { name: "Save alt text" }).click();

    await expect(figure.locator("img")).toHaveAttribute("alt", "One-pixel test image");
    await expect(figure).not.toHaveAttribute("data-needs-alt", "true");
    await expect(figure.locator("figcaption")).toHaveText("Tiny image caption");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    const publicFigure = page.locator(".article figure.content-image").first();
    await expect(publicFigure.locator("img")).toHaveAttribute("alt", "One-pixel test image");
    await expect(publicFigure.locator("figcaption")).toHaveText("Tiny image caption");
  });

  test("repeated image moves and metadata edits do not duplicate the figure", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<p>Before image.</p>` +
        `<figure class="doc-image" data-block-id="img-repeat-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="Original screenshot" />` +
        `</figure>` +
        `<p>After image.</p>`,
    );

    const figure = page.locator(".image-section-editor figure.doc-image").first();
    const imageEditor = page.locator(".image-section-editor").first();
    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(1);

    await figure.click();
    await imageEditor.getByRole("button", { name: "Move image down" }).click();
    await figure.click();
    await imageEditor.getByRole("button", { name: "Move image up" }).click();
    await figure.click();
    await imageEditor.getByRole("button", { name: "Edit image alt text" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit image alt text" });
    await dialog.getByLabel("Describe the image for screen readers").fill("Updated screenshot");
    await dialog.getByLabel("Visible caption (optional)").fill("Updated caption");
    await dialog.getByRole("button", { name: "Save alt text" }).click();

    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(1);
    await expect(figure.locator("img")).toHaveAttribute("alt", "Updated screenshot");
    await expect(figure.locator("figcaption")).toHaveText("Updated caption");

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article figure.content-image")).toHaveCount(1);
    await expect(page.locator(".article figure.content-image img")).toHaveAttribute("alt", "Updated screenshot");
    await expect(page.locator(".article figure.content-image figcaption")).toHaveText("Updated caption");
  });

  test("pasted image files become one standalone image section without jumping to the top", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      Array.from({ length: 80 }, (_, index) => `<p>Long editor line ${index + 1}</p>`).join(""),
    );

    const lastParagraph = page.locator(".wysiwyg-surface p").filter({ hasText: "Long editor line 80" }).first();
    await lastParagraph.scrollIntoViewIfNeeded();
    await lastParagraph.click();
    const beforePasteScrollY = await editorScrollTop(page);
    expect(beforePasteScrollY).toBeGreaterThan(100);

    await pasteTestPng(page);

    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator(".lexical-preserved-block figure.doc-image")).toHaveCount(0);
    await expect(page.locator(".wysiwyg-surface figure.doc-image")).toHaveCount(0);
    await expect
      .poll(() => editorScrollTop(page), { timeout: 5_000 })
      .toBeGreaterThan(Math.max(100, beforePasteScrollY - 120));

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article figure.content-image")).toHaveCount(1);
  });

  test("insert controls add text and uploaded images between existing sections", async ({ page }, testInfo) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<p>Before image.</p>` +
        `<figure class="doc-image" data-block-id="img-insert-between-test" data-width="100" data-align="left">` +
        `<img src="${TEST_IMAGE}" alt="Existing screenshot" />` +
        `</figure>` +
        `<p>After image.</p>`,
    );

    const imageEditor = page.locator(".block-editor").filter({ has: page.locator(".image-section-editor") }).first();
    const rowAfterImage = imageEditor.locator(
      "xpath=following-sibling::*[contains(concat(' ', normalize-space(@class), ' '), ' block-insert-row ')][1]",
    );
    await rowAfterImage.getByRole("button", { name: "Insert text here" }).click();

    const insertedTextEditor = rowAfterImage.locator(
      "xpath=following-sibling::article[contains(concat(' ', normalize-space(@class), ' '), ' block-editor ')][1]",
    );
    const insertedSurface = insertedTextEditor.locator(".wysiwyg-surface").first();
    await expect(insertedSurface).toBeVisible();
    await insertedSurface.click();
    await page.keyboard.type("Inserted between.");
    await expect(insertedSurface).toContainText("Inserted between.");

    const rowAfterInsertedText = insertedTextEditor.locator(
      "xpath=following-sibling::*[contains(concat(' ', normalize-space(@class), ' '), ' block-insert-row ')][1]",
    );
    await rowAfterInsertedText.getByRole("button", { name: "Insert media here" }).click();
    await page.getByRole("tab", { name: "Upload image" }).click();
    const uploadPath = testInfo.outputPath("insert-between.png");
    await writeFile(uploadPath, TEST_PNG_BYTES);
    await page.locator(".media-picker input[type='file']").setInputFiles(uploadPath);

    await expect(page.locator(".image-section-editor figure.doc-image")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator(".lexical-preserved-block figure.doc-image")).toHaveCount(0);

    await saveAndPublish(page);

    await page.goto(TARGET_PAGE_PUBLIC_PATH);
    await expect(page.locator(".article figure.content-image")).toHaveCount(2);
    const publicInsertedText = page.locator(".article > p").filter({ hasText: "Inserted between." }).first();
    await expect(publicInsertedText).toBeVisible();
    await expect(
      publicInsertedText.locator("xpath=preceding-sibling::*[1][self::figure[contains(@class, 'content-image')]]"),
    ).toBeVisible();
    await expect(
      publicInsertedText.locator("xpath=following-sibling::*[1][self::figure[contains(@class, 'content-image')]]"),
    ).toBeVisible();
  });
});
