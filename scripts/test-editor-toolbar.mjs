/**
 * Manual smoke test for the page document toolbar (run with dev server on :3000).
 * Usage: node scripts/test-editor-toolbar.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PAGE_ID = process.env.TEST_PAGE_ID ?? "page-program-fact-sheets";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE}/admin/sign-in?next=/admin/pages/${PAGE_ID}`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', process.env.KB_ADMIN_EMAIL ?? "admin@example.edu");
  await page.fill('input[name="password"]', process.env.KB_ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp(`/admin/pages/${PAGE_ID}`), { timeout: 20000 });

  const url = page.url();
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("Content") && !url.includes("/admin/pages/")) {
    console.error("Unexpected page after sign-in:", url, bodyText.slice(0, 500));
    process.exitCode = 1;
    await browser.close();
    return;
  }

  const surface = page.locator(".page-document-editor__surface");
  try {
    await surface.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    console.error("Editor surface missing at", url);
    console.error(bodyText.slice(0, 800));
    await page.screenshot({ path: "scripts/test-editor-toolbar-failure.png" });
    process.exitCode = 1;
    await browser.close();
    return;
  }

  await surface.click();
  await page.keyboard.press("Control+A");

  const crimson = page.locator('.rich-text-toolbar__color-swatch[title="Crimson"]');
  await crimson.click();

  await page.waitForTimeout(200);
  const html = await surface.innerHTML();
  const hasColor = /#981e32|color:\s*#981e32|color:\s*rgb\(152,\s*30,\s*50\)/i.test(html);

  await page.locator('button:has-text("• List")').click();
  await page.waitForTimeout(200);
  const hasList = (await surface.innerHTML()).includes("<ul");

  console.log(JSON.stringify({ hasColor, hasList, htmlSnippet: html.slice(0, 400) }, null, 2));

  if (!hasColor) {
    console.error("FAIL: color formatting not applied");
    process.exitCode = 1;
  }
  if (!hasList) {
    console.error("FAIL: bullet list not created");
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) {
    console.log("PASS: toolbar color and bullet list work in browser");
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
