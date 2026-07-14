import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
const kbAdminEmail = process.env.KB_ADMIN_EMAIL || "admin@example.edu";
const kbAdminPassword = process.env.KB_ADMIN_PASSWORD || "ChangeMe123!";
const kbAdminSessionSecret = process.env.KB_ADMIN_SESSION_SECRET || "a11y-suite-test-secret";

process.env.KB_ADMIN_EMAIL = kbAdminEmail;
process.env.KB_ADMIN_PASSWORD = kbAdminPassword;
process.env.KB_ADMIN_SESSION_SECRET = kbAdminSessionSecret;

export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: isCi ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: isCi ? "npm run start" : "npm run dev",
    env: {
      ...process.env,
      DATABASE_URL: "",
      KB_ADMIN_EMAIL: kbAdminEmail,
      KB_ADMIN_PASSWORD: kbAdminPassword,
      KB_ADMIN_SESSION_SECRET: kbAdminSessionSecret,
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
