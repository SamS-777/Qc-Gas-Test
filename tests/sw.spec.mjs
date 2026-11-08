// Service worker (revue 1, P1-3 et P2-7) : caches propres à l'appli, démarrage hors ligne.
import { test, expect } from "@playwright/test";
import { mockNet } from "./helpers.mjs";

test.use({ serviceWorkers: "allow" });

test("ne supprime que ses propres caches et démarre hors ligne", async ({ page, context }) => {
  await mockNet(page);
  // Caches d'une autre appli du même domaine, et d'une ancienne version de celle-ci, créés avant l'installation.
  await page.goto("/README.md");
  await page.evaluate(async () => {
    await (await caches.open("autre-appli-v1")).put("/x", new Response("x"));
    await (await caches.open("essence-v1")).put("/y", new Response("y"));
  });
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 10000 }).toEqual(expect.arrayContaining(["autre-appli-v1"]));
  const keys = await page.evaluate(() => caches.keys());
  const version = keys.find(k => k.startsWith("essence-"));
  expect(keys).not.toContain("essence-v1");
  expect(keys.filter(k => k.startsWith("essence-"))).toEqual([version]);
  const shell = await page.evaluate(async v => (await (await caches.open(v)).keys()).map(r => new URL(r.url).pathname), version);
  for (const f of ["/", "/index.html", "/manifest.webmanifest", "/vendor/leaflet/leaflet.js", "/vendor/leaflet/leaflet.css"]) expect(shell).toContain(f);

  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => typeof L)).toBe("object");
  await expect(page).toHaveTitle(/Essence/);
});
