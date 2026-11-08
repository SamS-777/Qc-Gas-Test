// Scénarios de l'appli, dont les reproductions des trois revues de code (2026-11-07). Réseau entièrement simulé.
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mockNet, open, searchNear, searchRoute, detoursDone, text, makeFeed, isoAgo, H } from "./helpers.mjs";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: H, body: JSON.stringify(body) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

test.beforeEach(async ({ page }) => {
  page.__errors = [];
  page.on("pageerror", e => page.__errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.__errors, "erreurs JavaScript").toEqual([]); });

/* ---------- Fonctions pures ---------- */
test.describe("logique pure", () => {
  test.beforeEach(async ({ page }) => { await mockNet(page); await open(page); });

  test("classement : prix réel puis distance, médiane et plein", async ({ page }) => {
    const r = await page.evaluate(() => {
      const o = { fuel: 0, fillL: 40, radiusKm: 5, off: new Set(), rebates: { Shell: 3 } };
      const st = [[45.5, -73.6, "a", "Shell", "x", 170, null, null], [45.5, -73.61, "b", "Esso", "y", 168, null, null], [45.5, -73.65, "c", "Esso", "z", 167, null, null], [45.5, -73.62, "d", "Ultramar", "w", 180, null, null]];
      const res = rankNearby(st, { lat: 45.5, lon: -73.6 }, o);
      return { order: res.ranked.map(x => x.name), eff: res.ranked.map(x => x.eff), median: res.median, fill: +res.ranked[0].fill.toFixed(2) };
    });
    expect(r.order).toEqual(["a", "c", "b", "d"]); // a : 170 − 3 = 167, ex æquo avec c mais plus proche
    expect(r.eff).toEqual([167, 167, 168, 180]);
    expect(r.median).toBe(167.5);
    expect(r.fill).toBe(66.8);
  });

  test("point dans un polygone et centre", async ({ page }) => {
    const r = await page.evaluate(() => {
      const sq = [[45, -74], [45, -73], [46, -73], [46, -74]];
      return { inside: inPoly(45.5, -73.5, sq), outside: inPoly(46.5, -73.5, sq), c: polyCenter(sq) };
    });
    expect(r.inside).toBe(true);
    expect(r.outside).toBe(false);
    expect(r.c.lat).toBeCloseTo(45.5, 6);
    expect(r.c.lon).toBeCloseTo(-73.5, 6);
  });

  test("parseGen : ISO strict et calendrier réel", async ({ page }) => {
    const r = await page.evaluate(() => Object.fromEntries([
      "2026-11-07T23:50:00.4402082Z", "2026-11-07T18:50:00-05:00", "2024-02-29T00:00:00Z",
      "2026-02-31T12:34:56Z", "2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-11-07T24:00:00Z", "2026-11-07T12:00:00+25:00", "2026-11-07T12:00:00", "n'importe quoi",
    ].map(v => { const t = parseGen(v); return [v, Number.isNaN(t) ? null : new Date(t).toISOString()]; })));
    expect(r["2026-11-07T23:50:00.4402082Z"]).toBe("2026-11-07T23:50:00.440Z");
    expect(r["2026-11-07T18:50:00-05:00"]).toBe("2026-11-07T23:50:00.000Z");
    expect(r["2024-02-29T00:00:00Z"]).toBe("2024-02-29T00:00:00.000Z");
    for (const bad of ["2026-02-31T12:34:56Z", "2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-11-07T24:00:00Z", "2026-11-07T12:00:00+25:00", "2026-11-07T12:00:00", "n'importe quoi"]) expect(r[bad], bad).toBeNull();
  });

  test("identifiant de station identique à celui du collecteur Python", async ({ page }) => {
    // Même vecteur que tests/test_collect.py : sha1("station test énergie|1234 rue saint-denis, montréal")[:10]
    const r = await page.evaluate(() => [sha1hex("abc"), stationKey({ name: "Station Test Énergie", address: "1234 Rue Saint-Denis, Montréal" })]);
    expect(r[0]).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(r[1]).toBe("48a09cc44d");
  });
});

/* ---------- Parcours principaux ---------- */
test("près de moi : top 10, médiane, autres stations et temps en voiture", async ({ page }) => {
  await mockNet(page); await open(page);
  await searchNear(page); await detoursDone(page);
  expect(await page.locator("#results > li").count()).toBe(10);
  await expect(page.locator("#sumMeta")).toContainText("médiane");
  await expect(page.locator("#restToggle")).toContainText("autres stations");
  expect(await page.locator(".det").count()).toBe(5);
});

test("trajet : alternatives, détours et liens de navigation", async ({ page }) => {
  await mockNet(page); await open(page);
  await searchRoute(page); await detoursDone(page);
  expect(await page.locator(".rt").count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#results .gm").first()).toHaveAttribute("href", /waypoints=/);
  await expect(page.locator("#results .wz").first()).toHaveAttribute("href", /waze\.com\/ul\?ll=/);
});

/* ---------- Courses asynchrones (revues 1 et 3) ---------- */
test("changer de mode pendant un calcul de trajet n'affiche pas de trajet fantôme", async ({ page }) => {
  await mockNet(page, { osrmRoute: async (route, n, next) => { await sleep(1500); return next(); } }); await open(page);
  await page.click("label[for=modeRoute]"); await page.fill("#from", "10074 j-j gagnier"); await page.fill("#to", "2175 maisonneuve est");
  await page.click("#go"); await sleep(300); await page.click("label[for=modeNear]"); await sleep(2000);
  const s = await page.evaluate(() => ({ lastMode, summary: !document.getElementById("summary").hidden, busy: document.getElementById("go").disabled }));
  expect(s).toEqual({ lastMode: null, summary: false, busy: false });
});

test("modifier la destination pendant le calcul annule la recherche", async ({ page }) => {
  await mockNet(page, { osrmRoute: async (route, n, next) => { await sleep(700); return next(); } }); await open(page);
  await page.click("label[for=modeRoute]"); await page.fill("#from", "45.5000, -73.5000"); await page.fill("#to", "45.6000, -73.6000");
  await page.click("#go"); await sleep(150); await page.fill("#to", "46.0000, -74.0000"); await sleep(1500);
  expect(await page.evaluate(() => [lastMode, lastB])).toEqual([null, null]);
  await page.click("#go"); await page.waitForSelector("#results li");
  expect(await page.evaluate(() => [lastB.lat, lastB.lon])).toEqual([46, -74]);
});

test("une réponse d'adresse en retard n'écrase pas le champ modifié", async ({ page }) => {
  await mockNet(page, { photon: async (route, u, next) => { await sleep(1200); return next(); } }); await open(page);
  await page.click("label[for=modeNear]"); await page.fill("#from", "10074 j-j gagnier"); await page.click("#go"); await sleep(200);
  await page.evaluate(() => { document.getElementById("from").value = "autre adresse"; }); await sleep(2000);
  expect(await page.evaluate(() => [document.getElementById("fromHint").textContent, picked.from])).toEqual(["", null]);
});

/* ---------- Flux de la Régie (revues 1, 2 et 3) ---------- */
test("flux partiel refusé au démarrage", async ({ page }) => {
  await mockNet(page, { feed: route => json(route, makeFeed({ n: 10 })) }); await open(page, { wait: false });
  await page.click("label[for=modeNear]"); await page.fill("#from", "10074 j-j gagnier"); await page.click("#go");
  await expect(page.locator("#status")).toContainText("incomplet");
  expect(await page.locator("#results li").count()).toBe(0);
});

test("un fichier plus ancien ne remplace pas des prix plus récents", async ({ page }) => {
  let gen = isoAgo(3);
  await mockNet(page, { feed: route => json(route, makeFeed({ gen, shift: gen.startsWith("2026-11-06") ? 50 : 0 })) }); await open(page);
  const before = await page.evaluate(() => generatedMs);
  gen = "2026-11-06T23:00:00Z";
  await page.evaluate(() => { nextFeedTry = 0; });
  await searchNear(page);
  expect(await page.evaluate(() => generatedMs)).toBe(before);
  await expect(page.locator("#status")).toContainText("non rafraîchis");
});

test("échec de rafraîchissement : anciens prix gardés, avertissement, un seul essai par minute", async ({ page }) => {
  let fail = false;
  const calls = await mockNet(page, { feed: (route, n, next) => fail ? route.fulfill({ status: 503, headers: H, body: "x" }) : next() }); await open(page);
  fail = true; await page.evaluate(() => { nextFeedTry = 0; });
  const n0 = calls.feed;
  await searchNear(page);
  for (let i = 0; i < 3; i++) { await page.click("#go"); await sleep(300); }
  expect(calls.feed - n0).toBe(1);
  await expect(page.locator("#status")).toContainText("non rafraîchis");
  expect(await page.locator("#results > li").count()).toBe(10);
});

test("premier chargement en échec : pas de nouveau téléchargement pendant la pause", async ({ page }) => {
  const calls = await mockNet(page, { feed: route => route.fulfill({ status: 503, headers: H, body: "x" }) }); await open(page, { wait: false });
  await sleep(800);
  await page.click("label[for=modeNear]"); await page.fill("#from", "10074 j-j gagnier");
  for (let i = 0; i < 3; i++) { await page.click("#go"); await sleep(300); }
  expect(calls.feed).toBe(1);
  await expect(page.locator("#fresh")).toHaveText("Prix indisponibles");
});

test("un seul téléchargement si on cherche pendant le chargement initial", async ({ page }) => {
  const calls = await mockNet(page, { feed: async route => { await sleep(1000); return json(route, makeFeed()); } });
  await open(page, { wait: false });
  await page.click("label[for=modeNear]"); await page.fill("#from", "10074 j-j gagnier"); await page.click("#go");
  await page.waitForSelector("#results li");
  expect(calls.feed).toBe(1);
});

test("délai réseau : un corps qui ne se termine jamais est coupé", async ({ page }) => {
  const srv = createServer((req, res) => { res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.write('{"partiel":'); });
  await new Promise(r => srv.listen(8791, r));
  try {
    await mockNet(page, { other: route => route.request().url().includes("localhost:8791") ? route.continue() : route.abort() }); await open(page);
    const r = await page.evaluate(async () => {
      const out = [];
      for (const as of ["json", "buffer"]) { const t0 = Date.now(); try { await fetchT("http://localhost:8791/x", {}, 800, as); out.push("résolu"); } catch (e) { out.push(Date.now() - t0 < 2000 ? "coupé" : "trop long"); } }
      return out;
    });
    expect(r).toEqual(["coupé", "coupé"]);
  } finally { srv.close(); }
});

/* ---------- Données locales (revues 1 et 2) ---------- */
test("préférences corrompues : démarrage normal, valeurs normalisées", async ({ page }) => {
  await mockNet(page);
  await open(page, { prefs: { favs: '{"a":1}', rebates: '{"Shell":99,"Esso":5,"Ultramar":50.5}', brandsOff: '"Shell"', fillL: "99999" } });
  expect(await page.evaluate(() => [JSON.stringify(rebates), localStorage.getItem("et_rebates"), favs.length])).toEqual(['{"Esso":5}', '{"Esso":5}', 0]);
  await searchNear(page);
  await expect(page.locator("#results .fillcost").first()).toContainText("200 L");
});

test("infobulle de trajet : le texte du fournisseur n'est jamais interprété comme du HTML", async ({ page }) => {
  await mockNet(page); await open(page);
  await page.evaluate(async () => {
    mapA.clear(); mapA.flyTo(45.555, -73.59, 14); await new Promise(r => setTimeout(r, 500));
    mapA.polyline([[-73.62, 45.555], [-73.56, 45.555]], { color: "#f00", weight: 14, tip: '<img src=x onerror="window.__xss=1"><b>gras</b>', onClick() {} });
  });
  const box = await page.locator("#map").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await sleep(400);
  const r = await page.evaluate(() => ({ html: document.querySelector(".leaflet-tooltip")?.innerHTML || "", xss: window.__xss || 0 }));
  expect(r.xss).toBe(0);
  expect(r.html).toContain("&lt;img");
});

/* ---------- Détours (revues 2 et 3) ---------- */
test("NoRoute sur une station ne coupe pas les autres", async ({ page }) => {
  await mockNet(page, { osrmTravel: (route, n, next) => n === 1 ? json(route, { code: "NoRoute", message: "Impossible route" }, 400) : next() }); await open(page);
  await searchNear(page); await detoursDone(page);
  expect(await page.locator(".det").count()).toBe(4);
});

test("fournisseur bloqué : disjoncteur, les 5 badges se résolvent en un seul délai", async ({ page }) => {
  await mockNet(page, { osrmTravel: async route => { await sleep(30000); return route.abort(); } }); await open(page);
  const t0 = Date.now();
  await searchNear(page); await detoursDone(page);
  expect(Date.now() - t0).toBeLessThan(20000);
});

/* ---------- Google (revues 1, 2 et 3) — faux Google Maps ---------- */
test("Google OK : carte Google, détours Google", async ({ page }) => {
  await mockNet(page); await open(page, { prefs: { gkey: "GOOD" } });
  await searchNear(page); await detoursDone(page);
  await expect(page.locator("#trafficState")).toHaveText("Google");
  expect(await page.evaluate(() => mapA.kind)).toBe("google");
});

test("clé refusée : repli Esri, indicateur et avertissement durables", async ({ page }) => {
  await mockNet(page); await open(page, { prefs: { gkey: "AUTHFAIL", ttkey: "" } });
  await sleep(800);
  await searchRoute(page);
  await expect(page.locator("#trafficState")).toHaveText("Google indisponible");
  await expect(page.locator("#status")).toContainText("Google indisponible avec cette clé");
  expect(await page.evaluate(() => mapA.kind)).toBe("esri");
});

test("gm_authFailure seul : le chargement Google est rejeté, pas bloqué", async ({ page }) => {
  await mockNet(page); await open(page, { prefs: { gkey: "AUTHONLY" } });
  const r = await page.evaluate(async () => {
    googleBad = false; gmapsPromise = null; delete window.google;
    return Promise.race([loadGoogle().then(() => "résolu", () => "rejeté"), new Promise(res => setTimeout(() => res("bloqué"), 1000))]);
  });
  expect(r).toBe("rejeté");
});

test("script Google injoignable : panne passagère, puis retour automatique", async ({ page }) => {
  let block = true;
  await page.clock.install();
  await mockNet(page, { google: (route, next) => block ? route.abort() : next() });
  await open(page, { prefs: { gkey: "GOOD" } });
  await expect(page.locator("#trafficState")).toHaveText("Google indisponible");
  expect(await page.evaluate(() => [googleBad, mapA.kind])).toEqual([false, "esri"]);
  block = false;
  await page.clock.runFor(2 * 60 * 1000 + 1000); // juste après la fin de la pause de 2 min
  // Puis le temps simulé avance lentement : le faux Google doit avoir le temps d'arriver par le réseau (sinon le délai de 15 s expirerait).
  for (let i = 0; i < 15; i++) { await sleep(100); await page.clock.runFor(200); }
  await expect(page.locator("#trafficState")).toHaveText("Google");
  await expect.poll(() => page.evaluate(() => mapA.kind)).toBe("google");
});

/* ---------- Historique ---------- */
test("historique : la reprise d'un carburant ne dépend pas des autres", async ({ page }) => {
  await page.clock.install();
  const series = { t0: Math.floor(Date.now() / 60000) - 600, debut: Math.floor(Date.now() / 60000) - 600, maj: "", s: {} };
  const calls = await mockNet(page, { hist: (route, code) => code === "R" ? route.fulfill({ status: 503, headers: H, body: "" }) : json(route, series) });
  await open(page);
  await searchNear(page);
  await page.click("#hist summary");
  await expect(page.locator("#histChart")).toContainText("indisponible");
  await page.click("label[for=fuel1]");
  await page.clock.runFor(61_000);
  await page.click("label[for=fuel0]");
  await expect.poll(() => calls.hist.R).toBe(2);
});

/* ---------- Carte : choix du centre et zones ---------- */
test("choisir le centre puis Chercher ici", async ({ page }) => {
  await mockNet(page); await open(page);
  await page.click("label[for=modeNear]"); await page.click("#pickBtn");
  await expect(page.locator("#pickUi")).toBeVisible();
  await page.click("#pickGo"); await page.waitForSelector("#results li");
  await expect(page.locator("#from")).toHaveValue(/9e Avenue/);
  await expect(page.locator("#pickUi")).toBeHidden();
});

test("dessiner une zone : stations à l'intérieur seulement, favori enregistré", async ({ page }) => {
  await mockNet(page); await open(page);
  await page.click("label[for=modeNear]"); await page.click("#drawBtn");
  await page.evaluate(() => mapA.flyTo(45.555, -73.62, 12)); await sleep(600);
  const b = await page.locator("#map").boundingBox();
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.28], [0.75, 0.7], [0.32, 0.72]]) { await page.mouse.click(b.x + b.width * x, b.y + b.height * y); await sleep(150); }
  await expect(page.locator("#drawDone")).toBeEnabled();
  await page.click("#drawDone"); await page.waitForSelector("#results li");
  await expect(page.locator("#sumTitle")).toContainText("dans ta zone");
  expect(await page.evaluate(() => lastAll.every(s => inPoly(s.lat, s.lon, lastPoly)))).toBe(true);
  await page.click("#favBtn");
  await expect(page.locator(".fav-go").first()).toContainText("Zone");
});

/* ---------- Clavier et lecteurs d'écran ---------- */
test("adresse : liste de suggestions accessible (combobox) et choix au clavier", async ({ page }) => {
  await mockNet(page); await open(page);
  const from = page.locator("#from");
  await expect(from).toHaveAttribute("role", "combobox");
  await expect(from).toHaveAttribute("aria-expanded", "false");
  await from.fill("10074 gagnier");
  await expect(page.locator("#fromList [role=option]").first()).toBeVisible();
  await expect(from).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(from).toHaveAttribute("aria-activedescendant", "fromOpt0");
  await expect(page.locator("#fromOpt0")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(from).toHaveValue(/Gagnier/);
  await expect(from).toHaveAttribute("aria-expanded", "false");
  expect(await from.getAttribute("aria-activedescendant")).toBeNull();
});

test("résultats : Tab jusqu'à une station, Entrée la montre sur la carte", async ({ page }) => {
  await mockNet(page); await open(page); await searchNear(page);
  const card = page.locator("#results .card").nth(2);
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveClass(/sel/);
  await expect(card).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#summary")).toHaveAttribute("aria-live", "polite");
  expect(await page.locator("section.results").getAttribute("aria-live")).toBeNull(); // la liste entière n'est plus relue
});

test("choisir le centre au clavier : la carte prend le focus, Entrée cherche ici, Échap annule", async ({ page }) => {
  await mockNet(page); await open(page);
  await page.click("label[for=modeNear]");
  await page.focus("#pickBtn"); await page.keyboard.press("Enter");
  await expect(page.locator("#pickBtn")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.activeElement === mapFocusEl())).toBe(true);
  await expect(page.locator("#pickUi .kbdhint")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pickUi")).toBeHidden();
  await expect(page.locator("#pickBtn")).toBeFocused(); // le focus revient au bouton
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // sur la carte : chercher au centre
  await page.waitForSelector("#results li");
  await expect(page.locator("#from")).toHaveValue(/9e Avenue/);
});

test("dessiner une zone au clavier : flèches, Entrée ajoute le centre, Terminer", async ({ page }) => {
  await mockNet(page); await open(page);
  await page.click("label[for=modeNear]");
  await page.focus("#drawBtn"); await page.keyboard.press("Enter");
  await page.evaluate(() => mapA.flyTo(45.555, -73.62, 12)); await sleep(600);
  await expect(page.locator("#drawUi .drawcross")).toBeVisible();
  const seq = [[], ["ArrowRight", "ArrowRight", "ArrowRight"], ["ArrowDown", "ArrowDown", "ArrowDown"], ["ArrowLeft", "ArrowLeft", "ArrowLeft"]];
  for (const keys of seq) {
    for (const k of keys) { await page.keyboard.press(k); await sleep(120); }
    await sleep(400);
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#drawMsg")).toContainText("4 points");
  expect(await page.evaluate(() => new Set(drawPts.map(p => p.join())).size)).toBe(4); // la carte a bien bougé entre les coins
  await page.click("#drawDone"); await page.waitForSelector("#results li");
  await expect(page.locator("#sumTitle")).toContainText("dans ta zone");
});

test("carte Google : Entrée sur la carte cherche aussi au centre", async ({ page }) => {
  await mockNet(page); await open(page, { prefs: { gkey: "GOOD" } });
  await expect.poll(() => page.evaluate(() => mapA && mapA.kind)).toBe("google");
  await page.click("label[for=modeNear]");
  await page.focus("#pickBtn"); await page.keyboard.press("Enter");
  expect(await page.evaluate(() => $("map").contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#results li");
  await expect(page.locator("#pickUi")).toBeHidden();
});

test("changer d'onglet garde la recherche de chaque mode (sans recalculer le trajet)", async ({ page }) => {
  const calls = await mockNet(page); await open(page);
  await searchRoute(page); await detoursDone(page);
  const routeTitle = await text(page, "#sumTitle"), nRoutes = await page.locator("#routes > *").count();
  const routeCalls = calls.osrmRoute;
  await searchNear(page, "2175 maisonneuve est");
  const nearTitle = await text(page, "#sumTitle");
  await page.click("label[for=modeRoute]");
  await expect(page.locator("#results li").first()).toBeVisible();
  expect(await text(page, "#sumTitle")).toBe(routeTitle);
  await expect(page.locator("#routes > *")).toHaveCount(nRoutes);
  await expect(page.locator("#from")).toHaveValue(/gagnier/i);
  await expect(page.locator("#to")).toHaveValue(/maisonneuve/i);
  expect(calls.osrmRoute).toBe(routeCalls); // aucun nouvel itinéraire demandé
  await page.click("label[for=modeNear]");
  expect(await text(page, "#sumTitle")).toBe(nearTitle);
  await expect(page.locator("#from")).toHaveValue(/maisonneuve/i);
});
