import { expect, test } from "@playwright/test";

test.describe("knowledge base scope picker", () => {
  test("pages dropdown selects a knowledge base by click and keyboard search", async ({ page }) => {
    await page.goto("/admin/pages?kb=graduate-school");

    await page.getByRole("button", { name: "Knowledge base" }).click();
    await page.getByRole("option", { name: /Graduate School Knowledge Base 2/ }).click();
    await expect(page).toHaveURL(/\/admin\/pages\?kb=graduate-school-2$/);
    await expect(page.locator(".admin-pages__kb-card h2")).toContainText("Graduate School Knowledge Base 2");

    await page.getByRole("button", { name: "Knowledge base" }).click();
    await page.getByLabel("Search knowledge bases").fill("staff");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/pages\?kb=graduate-school-staff$/);
    await expect(page.locator(".admin-pages__kb-card h2")).toContainText("Graduate School Staff Knowledge Base");
  });
});
