import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const kbAdminEmail = process.env.KB_ADMIN_EMAIL || "admin@example.edu";
const kbAdminPassword = process.env.KB_ADMIN_PASSWORD || "ChangeMe123!";
const kbAdminSessionSecret = process.env.KB_ADMIN_SESSION_SECRET || "a11y-suite-test-secret";

process.env.KB_ADMIN_EMAIL = kbAdminEmail;
process.env.KB_ADMIN_PASSWORD = kbAdminPassword;
process.env.KB_ADMIN_SESSION_SECRET = kbAdminSessionSecret;

// Deliberately not port 3000. The suite configures a hermetic server (DATABASE_URL forced
// empty, so the in-memory seed dataset backs it) and its assertions depend on that seed
// data. Sharing the default dev port meant an already-running `npm run dev` — typically
// pointed at a real Neon database — got reused instead, and every seed-dependent assertion
// failed in a way that looks exactly like a regression. Override with A11Y_PORT if 3100 is
// taken.
const port = Number(process.env.A11Y_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;
// Published back so specs that need an absolute URL (cookie domains, request-context calls)
// read the same port instead of hardcoding one.
process.env.A11Y_PORT = String(port);

export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Production server in both places. Locally this used to be `next dev`, which had two
    // problems: it diverged from what CI actually validates, and Next 16 refuses to start a
    // second dev server from the same directory at all — so the suite was unrunnable
    // whenever a dev server was open. CI builds in an earlier step; locally we build here.
    command: isCi
      ? `npm run start -- --port ${port}`
      : `npm run build && npm run start -- --port ${port}`,
    env: {
      ...process.env,
      DATABASE_URL: "",
      KB_ADMIN_EMAIL: kbAdminEmail,
      KB_ADMIN_PASSWORD: kbAdminPassword,
      KB_ADMIN_SESSION_SECRET: kbAdminSessionSecret,
    },
    url: baseURL,
    // Never reuse: the whole point is a known-empty-DATABASE_URL server. Reusing whatever
    // happens to be listening reintroduces the failure this port choice avoids.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
