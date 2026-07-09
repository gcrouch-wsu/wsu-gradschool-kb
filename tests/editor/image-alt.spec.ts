import { expect, test } from "@playwright/test";
import { TARGET_PAGE_PUBLIC_PATH, openEditor, saveAndPublish, setDocumentHtml } from "./helpers";

const TINY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

test.describe("image alt text workflow", () => {
  test("Alt dialog updates editor image metadata and public render", async ({ page }) => {
    await openEditor(page);
    await setDocumentHtml(
      page,
      `<figure class="doc-image" data-block-id="img-alt-test" data-width="100" data-align="left">` +
        `<img src="${TINY_GIF}" alt="" />` +
        `</figure>`,
    );

    const figure = page.locator(".wysiwyg-surface figure.doc-image").first();
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
