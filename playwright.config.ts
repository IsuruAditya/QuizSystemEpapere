import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a production build on a dedicated database (epapere_e2e).
 * Run: npm run test:e2e   (builds first; requires the local PostgreSQL from `npm run db:local:start`).
 */
const PORT = 3100;
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54329/epapere_e2e";
export const E2E_ENV = {
  APP_ENV: "test",
  DATABASE_URL: DB,
  DIRECT_DATABASE_URL: DB,
  APP_ORIGIN: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
  CRON_SECRET: "e2e-cron-secret-e2e-cron-secret-0123456789",
  MEDIA_STORE: "local",
  MEDIA_LOCAL_DIR: ".local-media",
  LOG_LEVEL: "warn",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] }, testMatch: /mobile|a11y/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
