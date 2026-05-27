import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

import { GAMMA_BASE_URL } from "./helpers/constants";

dotenv.config();

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["list"]
      ]
    : [["html", { open: "on-failure" }], ["list"]],
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: GAMMA_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
