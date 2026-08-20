import { expect, test, type Page } from "@playwright/test";

const KB_ID = "kb-grad-school";

async function createNode(page: Page, title: string, nodeKind: "page" | "group") {
  return page.evaluate(
    async ({ kbId, t, kind }) => {
      const response = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId,
          title: t,
          parentPath: [],
          nodeKind: kind,
          summary: "Fixture.",
          ownerLabel: "Graduate School",
          contactEmail: "gradschool@wsu.edu",
        }),
      });
      const body = await response.json();
      return body.pageId as string;
    },
    { kbId: KB_ID, t: title, kind: nodeKind },
  );
}

async function depthOf(page: Page, title: string) {
  return page
    .locator(".tree-editor__item")
    .filter({ hasText: title })
    .first()
    .getAttribute("data-depth");
}

async function moveUnder(page: Page, title: string, parentLabel: string) {
  await page.getByRole("button", { name: `More actions for ${title}` }).first().click();
  await page.getByRole("menuitem", { name: "Move under…" }).click();
  const dialog = page.getByRole("dialog", { name: "Move under" });
  // Options carry a "— " depth prefix, so match on the title and select by value.
  const value = await dialog
    .locator("option")
    .filter({ hasText: parentLabel })
    .first()
    .getAttribute("value");
  await dialog.getByLabel("New parent").selectOption(value ?? "");
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// The layout save has to succeed, not merely be clicked: it used to reject a batch that
// moved a node and re-parented something onto its new path in the same request.
async function saveTree(page: Page) {
  await page.getByRole("button", { name: "Save page tree" }).click();
  await expect(page.getByText("Page tree saved.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".alert--error")).toHaveCount(0);
}

test.describe("page tree nesting", () => {
  // "Indent under the previous page" cannot express "put this under X" unless X is already
  // the preceding sibling, and it is disabled for an only child — the exact state you are in
  // after nesting the first page under a heading.
  test("a page can be moved under an already-nested page", async ({ page }) => {
    await page.goto("/admin");
    const suffix = Date.now().toString().slice(-5);
    const heading = `Nest Heading ${suffix}`;
    const first = `Nest First ${suffix}`;
    const second = `Nest Second ${suffix}`;
    await createNode(page, heading, "group");
    await createNode(page, first, "page");
    await createNode(page, second, "page");

    await page.goto("/admin/pages?kb=graduate-school");
    await expect(page.locator(".tree-editor__item").filter({ hasText: second })).toHaveCount(1);

    await moveUnder(page, first, heading);
    await expect.poll(() => depthOf(page, first)).toBe("1");

    // The case that was unreachable: nest under a node that is itself nested.
    await moveUnder(page, second, first);
    await expect.poll(() => depthOf(page, second)).toBe("2");
  });

  test("a group heading can be nested under another group heading", async ({ page }) => {
    await page.goto("/admin");
    const suffix = Date.now().toString().slice(-5);
    const outer = `Outer Heading ${suffix}`;
    const inner = `Inner Heading ${suffix}`;
    await createNode(page, outer, "group");
    await createNode(page, inner, "group");

    await page.goto("/admin/pages?kb=graduate-school");
    await moveUnder(page, inner, outer);
    await expect.poll(() => depthOf(page, inner)).toBe("1");
  });

  test("a node cannot be moved under its own descendant", async ({ page }) => {
    await page.goto("/admin");
    const suffix = Date.now().toString().slice(-5);
    const parent = `Cycle Parent ${suffix}`;
    const child = `Cycle Child ${suffix}`;
    await createNode(page, parent, "page");
    await createNode(page, child, "page");

    await page.goto("/admin/pages?kb=graduate-school");
    await moveUnder(page, child, parent);
    await expect.poll(() => depthOf(page, child)).toBe("1");

    await page.getByRole("button", { name: `More actions for ${parent}` }).first().click();
    await page.getByRole("menuitem", { name: "Move under…" }).click();
    const dialog = page.getByRole("dialog", { name: "Move under" });
    const options = await dialog.getByLabel("New parent").locator("option").allTextContents();
    expect(options.some((option) => option.includes(child))).toBe(false);
    expect(options.some((option) => option.includes(parent))).toBe(false);
  });
});

test.describe("stale parent paths", () => {
  // The editor used to send the parent as a path. Reorganising the tree rewrites every
  // descendant path, so an editor tab opened beforehand held a path that no longer
  // resolved and the save died with "Parent page not found". The parent is an id now.
  test("saving an editor tab still works after the tree moved underneath it", async ({
    page,
    context,
  }) => {
    await page.goto("/admin");
    const suffix = Date.now().toString().slice(-5);
    const parent = `Stale Parent ${suffix}`;
    const child = `Stale Child ${suffix}`;
    await createNode(page, parent, "page");
    const childId = await createNode(page, child, "page");

    // Nest the child, then open its editor.
    await page.goto("/admin/pages?kb=graduate-school");
    await moveUnder(page, child, parent);
    await expect.poll(() => depthOf(page, child)).toBe("1");
    await saveTree(page);

    const editor = await context.newPage();
    await editor.goto(`/admin/pages/${childId}`);
    await editor.locator(".wysiwyg-surface").first().waitFor();

    // Reorganise in the first tab: the parent moves, rewriting the child's path.
    await page.goto("/admin/pages?kb=graduate-school");
    await moveUnder(page, parent, "Procedures");
    await saveTree(page);

    // The editor tab is now holding a stale path. Saving must still succeed.
    const surface = editor.locator(".wysiwyg-surface").first();
    await surface.click();
    await editor.keyboard.type("Edited after the tree moved.");
    await editor.getByRole("button", { name: /save changes|save & publish/i }).first().click();
    await expect(editor.getByText(/Parent page not found/i)).toHaveCount(0);
    await expect(editor.getByText(/Saved as/i).first()).toBeVisible({ timeout: 15_000 });
    await editor.close();
  });
});

test.describe("draft visibility in the reader tree", () => {
  // Drafts already reached the tree for signed-in staff, but rendered identically to
  // published pages, so there was no way to tell what readers could actually see.
  test("a draft page is labelled in the tree for signed-in staff", async ({ page }) => {
    await page.goto("/admin");
    const suffix = Date.now().toString().slice(-5);
    const title = `Draft Marker ${suffix}`;
    await createNode(page, title, "page");

    await page.goto("/kb/graduate-school");
    const row = page
      .locator(".page-tree__row")
      .filter({ hasText: title })
      .first();
    await expect(row).toBeVisible();
    await expect(row.locator(".badge--draft")).toHaveText("Draft");
  });
});
