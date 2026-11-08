// Outils communs aux tests : flux de la Régie synthétique et services externes simulés (aucun appel réseau réel).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const GSTUB = readFileSync(here + "fixtures/gstub.js", "utf8");
// Version courante de l'appli : par défaut, les tests la marquent comme déjà vue (pas de fenêtre « Quoi de neuf »).
export const APP_VERSION = readFileSync(here + "../index.html", "utf8").match(/const APP_VERSION = "([^"]+)"/)[1];
export const H = { "access-control-allow-origin": "*" };

// Points de référence (Montréal) : A = départ, B = destination.
export const A = [45.577, -73.642], B = [45.5263, -73.5516];
const hv = (a, b) => { const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };
const model = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += hv(pts[i - 1], pts[i]) * 1.35; return { km: d, min: d / 32 * 60 }; };
const line = (p, q, n = 12) => Array.from({ length: n + 1 }, (_, i) => [p[1] + (q[1] - p[1]) * i / n, p[0] + (q[0] - p[0]) * i / n]);
const ibe = [...line(A, [45.555, -73.60], 6), ...line([45.555, -73.60], B, 8).slice(1)];
const pie = [...line(A, [45.585, -73.60], 6), ...line([45.585, -73.60], B, 8).slice(1)];

export const isoAgo = min => new Date(Date.now() - min * 60000).toISOString();

// Flux GeoJSON déterministe : n stations autour de Montréal, quelques-unes collées au trajet A → B.
export function makeFeed({ n = 800, gen = isoAgo(3), shift = 0 } = {}) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const brands = ["Shell", "Esso", "Petro-Canada", "Ultramar", "Couche-Tard", "Costco", "Aucun"];
  const features = [];
  for (let i = 0; i < n; i++) {
    let lat, lon;
    if (i < 40) { const t = i / 40, p = ibe[Math.floor(t * (ibe.length - 1))]; lat = p[1] + (rnd() - 0.5) * 0.002; lon = p[0] + (rnd() - 0.5) * 0.002; }
    else { lat = 45.40 + rnd() * 0.35; lon = -73.90 + rnd() * 0.50; }
    const brand = brands[i % brands.length], reg = +(165 + rnd() * 20 + shift).toFixed(1);
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {
      Name: `${brand} ${i}`, brand, Status: "En opération", Address: `${1000 + i} Rue Test ${i}, Montréal`, PostalCode: "H1H 1H1", Region: "Montréal",
      Prices: [{ GasType: "Régulier", Price: `${reg}¢`, IsAvailable: true }, { GasType: "Super", Price: `${(reg + 22).toFixed(1)}¢`, IsAvailable: true }, { GasType: "Diesel", Price: `${(reg + 10).toFixed(1)}¢`, IsAvailable: i % 3 === 0 }],
    } });
  }
  return { type: "FeatureCollection", metadata: { generated_at: gen }, features };
}

const photonFeat = (hn, street, lat, lon) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { housenumber: hn, street, city: "Montréal", state: "Québec" } });

// Installe les services simulés. Chaque option remplace un service pour un scénario ; elle reçoit `next()`,
// qui applique la réponse simulée par défaut (ex. retarder puis répondre normalement). Retourne des compteurs d'appels.
export async function mockNet(page, o = {}) {
  const calls = { feed: 0, osrmRoute: 0, osrmTravel: 0, photon: 0, google: 0, hist: {} };
  await page.route("**/*", async route => {
    const url = route.request().url(), u = decodeURIComponent(url);
    if (url.startsWith("http://localhost:8765/")) return route.continue();
    if (u.includes("regieessencequebec.ca")) {
      calls.feed++;
      const next = () => route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify(makeFeed()) });
      return o.feed ? o.feed(route, calls.feed, next) : next();
    }
    if (u.includes("photon.komoot.io/reverse")) return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ features: [photonFeat("7230", "9e Avenue", 45.55, -73.6)] }) });
    if (u.includes("photon.komoot.io/api")) {
      calls.photon++;
      const q = u.split("q=")[1] || "";
      const f = q.includes("gagnier") ? photonFeat("10074", "Rue J.-J.-Gagnier", A[0], A[1]) : photonFeat("2175", "Boulevard De Maisonneuve Est", B[0], B[1]);
      const next = () => route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ features: [f] }) });
      return o.photon ? o.photon(route, u, next) : next();
    }
    if (u.includes("nominatim")) return route.fulfill({ status: 200, contentType: "application/json", headers: H, body: "[]" });
    if (u.includes("router.project-osrm.org")) {
      const pts = u.split("/driving/")[1].split("?")[0].split(";").map(s => s.split(",").map(Number).reverse());
      const m = model(pts);
      if (u.includes("alternatives")) {
        calls.osrmRoute++;
        const next = () => route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ code: "Ok", routes: [
          { distance: m.km * 1000, duration: m.min * 60, geometry: { coordinates: ibe }, legs: [{ steps: [{ name: "Rue D'Iberville", distance: 6000 }] }] },
          { distance: m.km * 1150, duration: m.min * 66, geometry: { coordinates: pie }, legs: [{ steps: [{ name: "Boulevard Pie-IX", distance: 8000 }] }] }] }) });
        return o.osrmRoute ? o.osrmRoute(route, calls.osrmRoute, next) : next();
      }
      calls.osrmTravel++;
      const next = () => route.fulfill({ status: 200, contentType: "application/json", headers: H, body: JSON.stringify({ code: "Ok", routes: [{ distance: m.km * 1000, duration: m.min * 60 }] }) });
      return o.osrmTravel ? o.osrmTravel(route, calls.osrmTravel, next) : next();
    }
    if (u.includes("maps.googleapis.com/maps/api/js")) {
      calls.google++;
      const p = new URL(url).searchParams, key = p.get("key");
      const mode = { GOOD: "OK", AUTHFAIL: "AUTHFAIL", AUTHONLY: "AUTHONLY", QUOTA: "QUOTA" }[key] || "OK";
      // Enveloppé : le script peut être chargé plusieurs fois dans la même page (nouvel essai après une panne).
      const next = () => route.fulfill({ status: 200, contentType: "application/javascript", body: `(function(){const MODE=${JSON.stringify(mode)}, CB=${JSON.stringify(p.get("callback"))};\n${GSTUB}\n})();` });
      return o.google ? o.google(route, next) : next();
    }
    if (u.includes("raw.githubusercontent.com")) {
      const code = (u.match(/series\/(\w)\.json/) || [])[1];
      calls.hist[code] = (calls.hist[code] || 0) + 1;
      const next = () => route.fulfill({ status: 404, headers: H, body: "" });
      return o.hist ? o.hist(route, code, calls.hist[code], next) : next();
    }
    if (o.other) return o.other(route, u);
    return route.abort(); // tuiles, polices, etc. : jamais de réseau réel dans les tests
  });
  return calls;
}

// Ouvre l'appli avec des préférences initiales (clés et réglages dans localStorage).
export async function open(page, { prefs = {}, wait = true } = {}) {
  prefs = { seenVersion: APP_VERSION, ...prefs };
  for (const k of Object.keys(prefs)) if (prefs[k] === undefined) delete prefs[k]; // undefined : clé absente (premier lancement)
  await page.addInitScript(p => { if (!sessionStorage.getItem("__init")) { localStorage.clear(); for (const [k, v] of Object.entries(p)) localStorage.setItem("et_" + k, v); sessionStorage.setItem("__init", "1"); } }, prefs);
  await page.goto("/");
  if (wait) await page.waitForFunction(() => typeof stations !== "undefined" && stations && stations.length > 500);
}

export async function searchNear(page, from = "10074 j-j gagnier") {
  await page.click("label[for=modeNear]");
  await page.fill("#from", from);
  await page.click("#go");
  await page.waitForSelector("#results li");
}
export async function searchRoute(page) {
  await page.click("label[for=modeRoute]");
  await page.fill("#from", "10074 j-j gagnier");
  await page.fill("#to", "2175 maisonneuve est");
  await page.click("#go");
  await page.waitForSelector("#results li");
}
export const detoursDone = page => page.waitForFunction(() => !document.querySelector(".det.wait"), null, { timeout: 30000 });
export const text = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : ""; }, sel);
