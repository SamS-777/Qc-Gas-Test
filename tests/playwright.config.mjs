// Tests navigateur d'Essence sur mon trajet. Le site est servi tel quel (aucun build) par un petit serveur local.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:8765/",
    viewport: { width: 1280, height: 950 },
    serviceWorkers: "block", // le service worker a ses propres tests (sw.spec.mjs)
    locale: "fr-CA",
    timezoneId: "America/Toronto",
  },
  webServer: {
    command: "python3 -m http.server 8765 --directory ..",
    url: "http://localhost:8765/index.html",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "ignore",
  },
});
