import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const TEST_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='320' viewBox='0 0 640 320'%3E%3Crect width='640' height='320' fill='%23f6f3f0'/%3E%3Crect x='32' y='32' width='576' height='256' fill='%23fff' stroke='%23a60f2d' stroke-width='8'/%3E%3C/svg%3E";

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
    await figure.click();
    await page.getByRole("button", { name: "Move image down" }).click();

    await expect(page.locator(".wysiwyg-surface > *").first()).toHaveText("Paragraph after the image.");

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
    await saveAndPublish(page);
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await figure.click();
    await page.getByRole("button", { name: "Shrink image" }).click();
    await page.getByRole("button", { name: "Shrink image" }).click();

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
    await expect(figure).toBeVisible();
    await expect(figure).toHaveAttribute("data-needs-alt", "true");

    await figure.click();
    await page.getByRole("button", { name: "Edit image alt text" }).click();

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
});
