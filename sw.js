/* Service worker d'Essence sur mon trajet.
   - L'appli (page, icônes, bibliothèque de carte, polices) est gardée en cache : démarrage instantané, même hors connexion.
   - La page est d'abord demandée au réseau : une nouvelle version mise en ligne arrive dès la prochaine ouverture.
   - Les prix, trajets, adresses et tuiles de carte ne sont jamais mis en cache : ils restent toujours en direct. */
const VERSION = "essence-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];
const STATIC_HOSTS = ["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Une ressource qui échoue (ex. réseau capricieux) ne doit pas bloquer l'installation.
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La page : réseau d'abord, cache en secours.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Fichiers de l'appli et ressources statiques : cache d'abord, puis mise à jour en arrière-plan.
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || STATIC_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const refresh = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await refresh) || Response.error();
    })());
  }
  // Tout le reste (Régie, TomTom, OSRM, Photon, tuiles Esri) passe directement au réseau.
});
