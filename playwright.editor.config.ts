import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

// Editor regression suite. Unlike the a11y suite this drives the authenticated
// admin editor, so it signs in once (the `setup` project) and reuses the
// resulting session cookie. Runs single-worker because the tests share the
// admin page lock and the no-database in-memory content store on the dev
// server, both of which are process-global.
export default defineConfig({
  testDir: "./tests/editor",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/editor/.auth/state.json",
      },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  // Runs against a production build (`next build` + `next start`), not `next dev`.
  // The per-request CSP in src/proxy.ts uses a nonce + `strict-dynamic`; the dev
  // server's HMR/eval runtime does not hydrate cleanly under it, so the editor's
  // client handlers stay dead. The production server hydrates as intended.
  //
  // Bootstrap admin env vars enable the dev-owner credentials in a production
  // NODE_ENV (see src/lib/auth.ts). DATABASE_URL is forced empty so the app uses
  // the in-memory seed dataset — the suite needs no external database.
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !isCi,
    timeout: 300_000,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "",
      KB_ADMIN_EMAIL: process.env.KB_ADMIN_EMAIL || "admin@example.edu",
      KB_ADMIN_PASSWORD: process.env.KB_ADMIN_PASSWORD || "ChangeMe123!",
      KB_ADMIN_SESSION_SECRET: process.env.KB_ADMIN_SESSION_SECRET || "editor-suite-test-secret",
    },
  },
});
