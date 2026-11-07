/* Service worker d'Essence sur mon trajet.
   - L'appli (page, icônes, bibliothèque de carte) est gardée en cache : démarrage instantané, même hors connexion.
   - La page est d'abord demandée au réseau : une nouvelle version mise en ligne arrive dès la prochaine ouverture.
   - Les prix, trajets, adresses, tuiles de carte et l'historique ne sont jamais mis en cache : ils restent en direct.
   - Les caches portent le préfixe « essence- » : le domaine github.io est partagé avec d'autres projets,
     on ne touche jamais à leurs caches. */
const PREFIX = "essence-";
const VERSION = PREFIX + "v20";
// Indispensables : l'installation échoue (et l'ancienne version reste active) s'ils ne sont pas téléchargés.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
];
// Utiles mais non bloquants.
const EXTRA = [
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
];
const STATIC_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await Promise.all(EXTRA.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

const cacheable = res => res && (res.ok || res.type === "opaque");

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La page : réseau d'abord ; seule une vraie page HTML valide remplace la copie en cache.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok && (fresh.headers.get("content-type") || "").includes("text/html")) {
          const cache = await caches.open(VERSION);
          await cache.put("./index.html", fresh.clone());
        }
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Fichiers de l'appli et polices : cache d'abord, puis mise à jour en arrière-plan (menée à terme grâce à waitUntil).
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || STATIC_HOSTS.includes(url.hostname)) {
    const refresh = (async () => {
      try {
        const res = await fetch(req);
        if (sameOrigin ? res.ok : cacheable(res)) {
          const cache = await caches.open(VERSION);
          await cache.put(req, res.clone());
        }
        return res;
      } catch { return null; }
    })();
    event.waitUntil(refresh);
    event.respondWith((async () => {
      const hit = await (await caches.open(VERSION)).match(req);
      return hit || (await refresh) || Response.error();
    })());
  }
  // Tout le reste (Régie, Google, TomTom, OSRM, Photon, tuiles, historique) passe directement au réseau.
});
