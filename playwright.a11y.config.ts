import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

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
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
