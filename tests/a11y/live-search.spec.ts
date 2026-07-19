import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("KB search widget suggests results in place and stays axe-clean", async ({ page }) => {
  await page.goto("/kb/graduate-school");
  const input = page.getByRole("combobox", { name: /search graduate school knowledge base/i });
  await expect(input).toBeVisible();

  await input.fill("fact");
  const listbox = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(listbox).toBeVisible();
  await expect(
    listbox.getByRole("option").filter({ hasText: "Maintaining Program Fact Sheets" }),
  ).toBeVisible();
  await expect(listbox.getByRole("option").filter({ hasText: "See all results" })).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await input.press("Escape");
  await expect(listbox).toBeHidden();

  await input.press("Enter");
  await expect(page).toHaveURL(/\/kb\/graduate-school\/search\?q=fact/);
});
