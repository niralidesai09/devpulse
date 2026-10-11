// E2E tests run against E2E_BASE_URL (default: a local production server).
//   npm run build && npm start            # in one terminal
//   npm run test:e2e                      # in another
//   E2E_BASE_URL=https://<app>.vercel.app npm run test:e2e   # against production
// Admin flows need E2E_ADMIN_PASSCODE (they are skipped otherwise).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@responsive/ },
  ],
});
