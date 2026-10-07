import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// End-to-end tests run against the production build (service worker included).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173/",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: !CI,
    timeout: 120_000
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1194, height: 834 }, hasTouch: true } },
    // Safari's engine on an 11-inch iPad, the closest to the real device. CI installs WebKit;
    // locally it runs when E2E_WEBKIT=1 and WebKit is installed.
    ...(CI || process.env.E2E_WEBKIT ? [{ name: "ipad-webkit", use: { ...devices["iPad Pro 11 landscape"] } }] : [])
  ]
});
