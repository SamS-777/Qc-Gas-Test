# Essence sur mon trajet — technical overview for code review

**What it is:** a static, installable web app (PWA) that shows the cheapest gas stations in Quebec along a driving route or around a point, using the real-time price feed published by the Régie de l'énergie du Québec.

- **Live site:** https://sams-777.github.io/Qc-Gas-Test/ (GitHub Pages, repo `SamS-777/Qc-Gas-Test`, branch `main`)
- **Users:** the owner and a few friends. Personal project, no backend, no accounts, no analytics.
- **UI language:** French by default, English toggle. Code comments are in French.
- **Status:** working in production. Three external review rounds (Codex, 2026-11-07: a review, a counter-review of v19 and one of v20) have been answered. See `REVIEW_RESPONSE.md` for the point-by-point responses and what changed.

---

## 1. Package contents

| Path | Role | Size |
|---|---|---|
| `index.html` | The whole app: HTML, CSS and JS inline, no build step | ~2,340 lines |
| `sw.js` | Service worker (app-shell cache, network-first page) | ~90 lines |
| `vendor/leaflet/` | Leaflet 1.9.4 (JS, CSS, control images, licence), self-hosted. Byte-identical to the npm registry tarball | — |
| `manifest.webmanifest` | PWA manifest | — |
| `icons/` | App icons (any + maskable, Apple touch, favicon) | — |
| `scripts/collect.py` | Price-history collector, run by GitHub Actions. Python 3.9+, stdlib only | 272 lines |
| `.github/workflows/historique.yml` | Cron workflow that runs the collector and commits to branch `historique` | — |
| `README.md` | Owner-facing setup guide, in French | — |
| `APP_OVERVIEW.md` | This file | — |
| `tests/` | Automated tests: `test_collect.py` (Python unittest, collector) and `app.spec.mjs` / `sw.spec.mjs` (Playwright, all external services mocked via `helpers.mjs` and a fake Google Maps in `fixtures/gstub.js`). They cover the reproductions from the three review rounds. | — |
| `.github/workflows/tests.yml` | Runs both suites on every push to `main` | — |
| `REVIEW_RESPONSE.md` | Response to the first review: fixed, partly fixed, declined, with how each was verified | — |

External runtime dependencies (no npm, no bundler):
- **Leaflet 1.9.4**, self-hosted in `vendor/leaflet/` (it used to come from unpkg).
- **Google Fonts** (DM Sans, Source Serif 4).
- **Google Maps JavaScript API**, loaded at runtime only if the user pastes a key.

---

## 2. Features

### 2.1 Two search modes
- **Sur mon trajet (route).**
  - Start and destination are entered as addresses with autocomplete.
  - The app gets up to 3 route alternatives and keeps stations within a corridor of the selected route. The corridor is configurable in metres.
  - Each station gets its distance to the route and its position along it.
- **Près de moi (nearby).** Three ways to define the search area:
  - **Circle.** A centre plus a radius of up to 300 km. The centre comes from an address, "my location" (`navigator.geolocation`), or a point picked on the map. Picking on the map works two ways: a "Choisir le centre" button opens a placement mode with a fixed centre pin, a live ghost circle and a "Chercher ici" button; long-press or right-click on the map is a shortcut.
  - **Drawn area (polygon).** "Dessiner une zone": each tap adds a vertex, with undo, cancel and Done, and a minimum of 3 points. Stations inside the polygon are kept.
  - **Distances for a polygon** are measured from the user's location if it is known, otherwise from the polygon centroid. With the centroid, no drive time is computed and the Google Maps link omits `origin`.

### 2.2 Ranking
- **Effective price** = posted price − the per-brand rebate the user configured (¢/L).
- **Sort order:** effective price ascending, then distance. Distance means distance to the route in route mode and distance to the origin in nearby mode.
- **Display:** the top 10 are shown as cards. The first 5 also get a real road-network figure: detour time and distance in route mode, drive time in nearby mode.
- **Area median:** computed over all matching stations, on effective prices. Each card shows its position against the median as a pill ("Sous la médiane · −3,60 $" on a fill of N litres).
- **Brand filter:** checkboxes, with Costco off by default. Per-brand rebates are set in the same panel.

### 2.3 Other stations (beyond the top 10)
- **On the map:** small dots coloured against the median: green below, grey within ±0.05 ¢, red above. There is a legend. Above 300 stations, only the 300 nearest are drawn.
- **Under the list:** a collapsed "Afficher les N autres stations" opens compact rows sorted by price, 50 at a time. Tapping a row centres the map, opens the station's popup and reveals the Google Maps and Waze buttons.

### 2.4 Price history chart
- **Where:** a collapsed `<details>` under the result title, with 7-day and 30-day views.
- **Area view:** the median of the current result set at each grid step (30 min for 7 days, 2 h for 30 days), rebates applied, followed by a final live point equal to the current median.
- **Station view:** clicking a station (card, compact row, pin or dot) switches the chart to that station's step series. "← Toute la zone" goes back.
- **Data:** read from `raw.githubusercontent.com/.../historique/data/series/{R,S,D}.json` (see §5).
- **Drawing:** an inline SVG step line with a crosshair tooltip. No charting library.
- **Caveat:** the history only started on 2026-11-07, so the charts are mostly flat or short for now. That is expected.

### 2.5 Navigation hand-off
- **Google Maps:** the URL API, `dir/?api=1`. In route mode it uses the station as a waypoint between start and destination. In nearby mode it is origin → station.
- **Waze:** a deep link, `waze.com/ul?ll=…&navigate=yes`.

### 2.6 Favourites
- **Saved from the result title (☆).** Three kinds:
  - route: from and to;
  - nearby circle: centre and radius;
  - drawn area: polygon plus a neighbourhood name from reverse geocoding.
- Favourites are stored in `localStorage`, per device.

### 2.7 Other
- **Theme:** Auto, Clair or Sombre, with a matching Google map style.
- **Language:** FR or EN.
- **Fuel:** Régulier, Super or Diesel. The Régie publishes a single "Super" grade with no octane rating, so the UI says "Super" (tooltip: octane not specified by the Régie).
- **Fill size** in litres, used for the $ figures.
- **Installable PWA** that also works offline for the app shell. Prices are never cached.

---

## 3. External services

| Service | Use | Key | Failure handling |
|---|---|---|---|
| Régie `stations.geojson.gz` | All prices and stations (~2,470), refreshed every ~5 min | none | Error message; the app can't work without it |
| Google Maps JS (`maps`, `routes`, `core`) | Map tiles and styles; `Route.computeRoutes` with `TRAFFIC_AWARE` for routes, detours and drive times | user key, in localStorage | `gm_authFailure` / quota / denied → falls back to the Esri map and TomTom/OSRM routing, with a visible note |
| TomTom Routing | Routes with traffic, plus detours | optional user key | → OSRM |
| OSRM public demo (`router.project-osrm.org`) | Routes and detours without traffic | none | Error shown |
| Photon (`photon.komoot.io`) | Address autocomplete; reverse geocoding for picked points and zone names | none | Nominatim fallback for forward search |
| Nominatim | Forward-geocoding fallback | none | — |
| Esri World Street Map tiles (Leaflet) | Map when there is no Google key; OSM France tiles as a second fallback | none | — |
| raw.githubusercontent.com (branch `historique`) | Price history series | none | "Historique indisponible" message, retried after 60 s |

Routing provider order: **Google → TomTom → OSRM**. Google has two failure states: `googleBad` (key/API/site refused, permanent until the key changes) and `googleDownUntil` (script unreachable, timeout or quota: Google is skipped for 2 to 10 min, then retried). Both update the provider badge and a persistent warning. In route mode, detours always use the same provider as the selected route, so detour = (route via station) − (selected route).

---

## 4. Front-end architecture (`index.html`)

A single file. A few markers so the reviewer doesn't have to read it top to bottom:

| Lines (v20) | Section |
|---|---|
| 1–505 | `<head>`, CSS design tokens (light/dark, `--clay`, `--good`, `--bad`, …) and component CSS. Markup: header, form, results, map column |
| 507–608 | **Pure logic:** `projector`, `nearestOnRoute`, `haversineKm`, `effective`, `item`, `finish` (sort + median + fill), `rankOnRoute`, `inPoly`, `polyCenter`, `rankPoly`, `rankNearby` |
| 609–615 | `store` — `localStorage` wrapper with prefix `et_`, try/catch on every access |
| 616–814 | `I18N` (fr, en) and `t(key, vars)` with `{placeholder}` interpolation |
| 815–838 | `fetchT(url, opts, ms, as)` — the timeout covers the **whole** response (headers and body); it returns `{ok, status, data}` with the body already parsed (`json`, `json?` or `buffer`). `withTimeout(promise, ms)` stops waiting for Google `computeRoutes` but cannot cancel it. |
| 839–932 | Feed loading. `loadStations` fetches, detects gzip manually, decompresses with `DecompressionStream` and runs `compact()` into arrays `[lat, lon, name, brand, address, R, S, D]` with range-checked coordinates. It rejects fewer than 500 stations, and a feed older than the one in memory (`parseGen` reads `metadata.generated_at`), **before** replacing data. `ensureStations()` runs a single shared download (`stationLoad`), schedules the next attempt 5 min after a success or 1 min after a failure, and keeps the previous data on failure. `noteText()` composes the persistent warnings: route fallback, stale/old/undated prices (judged on `generated_at`, not download time), and Google refused/down. |
| 933–1004 | Brand filter and rebates. Stored preferences are type-checked. |
| 1005–1083 | Geocoding (Photon, Nominatim) and the autocomplete widget. The location bias sent to Photon is rounded to about 1 km. |
| 1084–1301 | Routing: TomTom, OSRM, Google (`loadGoogle`, `gCompute`, `routesGoogle`, `travelGoogle`, `markGoogle`) and `getRoutes`, which returns `{routes, note}` (no shared global). `computeDetours` is sequential with a per-batch circuit breaker: a provider-level failure (timeout, network, quota, refusal, 5xx) skips that provider for the remaining stations, while a station-specific error (`localErr`, e.g. OSRM `NoRoute`) only affects that station. The cache records the provider that actually answered (10 min for the primary, 2 min for a fallback, failures not cached), is capped at 300 entries and is cleared on key change. |
| 1302–1426 | Settings getters, `setMode` (which cancels any search in flight), `clearResults`, `rerender`, `render` |
| 1427–1509 | Navigation links, other-stations list and dots helpers |
| 1510–1683 | Map point picking (placement mode, long-press), polygon drawing mode, `runZone` |
| 1684–1888 | Price-history chart. A pure-JS SHA-1 builds the station key. `histLoad` validates the JSON, keeps a 10-min TTL and retries per attempt. `histRender` and `drawHist` (SVG) draw it. |
| 1889–2166 | Map adapters (`leafletAdapter`, `googleAdapter`, same interface), `initMap` / `useEsri` / `onGoogleFail`, `draw()` |
| 2167–2226 | Favourites (validated on load) |
| 2227–2304 | Events. The search generation (`searchGen`, `busy`, `cancelSearch`) lets a newer search or a mode change make older ones stale; after each `await`, a stale search returns without touching state. `geocode()` has no side effects; the caller commits the result (`commitPick`) only if its search is current and the field text is unchanged. |
| 2305–2344 | Startup and service-worker registration |

Key global state:
- **Data:** `stations` (compact array), `lastMode`, `lastA`, `lastB`, `lastRoutes`, `lastRoute`, `sel`.
- **Results:** `lastTop` (top 10), `lastRest`, `lastAll` (full ranked set), `lastMedian`, `lastPoly`, `lastPolyName`.
- **Map and modes:** `mapA` (active map adapter), `picking`, `drawing`, `drawPts`, `here` (last geolocation).
- **History chart:** `histKey`, `histDays`, `histData`.

**Rendering model:** `render()` rebuilds the result DOM and calls `draw()`, which clears and redraws the map overlays. `rerender()` is triggered by theme, language, fuel, brand, rebate, radius and fill changes. The ranking is recomputed from `stations` each time; that's fast enough at ~2.5k stations.

### localStorage keys (prefix `et_`)
- `gkey`, `ttkey` — API keys, which never leave the browser except in requests to their own provider;
- `favs`, `brandsOff`, `rebates`;
- `mode`, `lang`, `theme`, `fuel`;
- `corridorM`, `radiusKm`, `fillL`;
- `from`, `to`;
- `costco` — legacy, migration only.

### Service worker (`sw.js`)
- **Cache name:** `VERSION = "essence-v23"`, bumped manually on each release. Activation deletes only caches starting with `essence-`, because the `github.io` origin is shared with the owner's other projects.
- **Install:** the minimal shell (`./`, `index.html`, manifest, Leaflet JS/CSS) must download or the install fails, so the old version stays active. Icons and images are optional.
- **Navigation:** network-first. Only a valid HTML response replaces the cached `index.html`, and `cache.put` is awaited. The cached page is the offline fallback.
- **Same-origin files and Google Fonts:** cache-first, with a background refresh kept alive by `event.waitUntil`. Same-origin files are cached only if `ok`.
- **Everything else** passes straight to the network: Régie, routing, geocoding, tiles, history.

---

## 5. Price-history pipeline

- **Workflow:** `.github/workflows/historique.yml`, cron `7,37 * * * *` plus manual dispatch. In practice GitHub runs it less often than scheduled.
- **Isolation:** it checks out `main`, creates a worktree on the orphan branch `historique` (created if missing), runs `python3 scripts/collect.py hist/data` and commits/pushes only if something changed. `main` and the site are never touched.
- **Collector:** stdlib only.
  - Skips the run if `metadata.generated_at` is unchanged.
  - Aborts if fewer than 500 stations are read (protects against a malformed feed).
  - **Station key:** `sha1(name.lower() | address.lower())[:10]`, because the Régie provides no ID. The front end recomputes the same key with its own SHA-1 implementation; all 2,463 stations of a test snapshot matched.

- **Weekly compaction:** each run rewrites ~1 MB of files, so the branch would grow by hundreds of MB per year. When `.compacte` (branch root) is older than 7 days or missing, the workflow first points the tag `historique-precedent` at the current tip through the GitHub API (a shallow clone cannot push a tag; if the API call fails the step stops before touching anything), then replaces the branch with a single orphan commit holding the same tree, pushed with `--force-with-lease`. Data is unchanged; the tag keeps one week of Git history for rollback until the next compaction.

**Files written** (branch `historique`, folder `data/`):

| File | Content |
|---|---|
| `changes/YYYY-MM.csv` | `t, station, carburant (R/S/D), prix` — one row per price change; an empty price means it became unavailable. Append-only, full history. |
| `state.jsonl` | Last known price, name, brand, address, region and coordinates per station |
| `summary/regions.json` | Per day (Quebec time), per administrative region and fuel: min, q1, median, q3, max, n. A "Québec" aggregate is included; 400 days are kept. |
| `series/{R,S,D}.json` | **Read by the app.** Step series for the last 35 days: `{t0 (epoch minutes), debut, maj, fenetre_jours, s: {station: [t, price×10, t, price×10, …]}}` with `t` relative to `t0`; 0 means no price. Each station's first point is its price at the window start. Updated incrementally on each run, and rebuilt from `changes/` if missing. |
| `meta.json` | Last run that processed a **new** Régie file (`generated_at`, station count, changes recorded). A run on an unchanged file does not touch it, so check liveness in GitHub *Actions*. |

---

## 6. Known limitations and deliberate trade-offs

1. **Single ~2,340-line HTML file, no build.** Automated tests now live in `tests/` and run in GitHub Actions on every push: 32 browser scenarios, 1 service-worker scenario and 11 collector tests. They cover the ranking logic, the async races, feed freshness and failure handling, network timeouts, Google failure states, detour breaker, history retry, map picking and drawing (pointer and keyboard), combobox ARIA, offline start, and every collector guard. Pure functions are tested in the page (the file is not split into modules).
2. **Station identity relies on name + address.** If the Régie edits either, the history for that station splits into two keys.
3. **Public demo servers.** The OSRM demo server and Photon/Nominatim have fair-use policies that aren't designed for production. Load is tiny (a handful of users) but it's a dependency risk.
4. **Google costs.** Each route search makes about 6 traffic-aware Routes computations (1 route + 5 detours), and each map load is billed. Without API restrictions or daily quotas, a leaked key could incur charges. Keys are not in the published code: each user pastes their own, and it is stored only in their browser.
5. **History freshness.** The collector also ignores a feed whose `generated_at` is older than the last one recorded, parses full ISO timestamps with offsets, and logs duplicate name + address keys. The history lags 30–60 min because of the GitHub cron, and `raw.githubusercontent.com` adds about a 5-min cache. The chart's last point is always the live price. GitHub disables cron workflows in public repos after 60 days without repository activity; it is unclear whether the bot's own commits count.
6. **Geometry approximations.**
   - Point-in-polygon is done on raw lat/lon (planar), which is fine at city scale.
   - The route corridor uses a local equirectangular projection.
   - Straight-line distances are used for ranking; road distance is computed only for the top 5.
7. **Price-history chart.**
   - The area median uses the stations in today's result set, so stations closed during the period are not included.
   - Rebates are applied retroactively as constants.
8. **Accessibility.**
   - Address fields are ARIA comboboxes (`aria-expanded`, `aria-activedescendant`, `role=listbox/option`).
   - Result cards are focusable; Enter or Space selects one (`aria-current`). Only the summary is a live region, not the whole list.
   - Map modes: entering placement or drawing moves focus to the map (arrows pan). Enter searches at the centre (placement) or adds the centre as a corner (drawing, with a crosshair). A keyboard hint appears while the map has focus. Escape cancels and returns focus to the mode button, which exposes `aria-pressed`.
   - Remaining gaps: the chart has an `aria-label` summary but no table view; map markers duplicate the list and are not otherwise announced.
9. **Global mutable state and some `var` declarations,** used deliberately to avoid temporal-dead-zone errors for functions called at startup. There is no framework.
10. **README.md is owner-facing and partly older than the code.** Its setup steps are accurate. For the feature set, this overview is authoritative.

---

## 7. What we'd like from the review

In priority order:

1. **Correctness bugs.**
   - Ranking, median, corridor and polygon filtering.
   - Detour arithmetic.
   - Stale async results: `detGen`, the history loading race, reverse-geocode callbacks.
   - Favourites keys and migration.
   - History reconstruction in `collect.py` (`update_series` window trimming and the bootstrap path).
2. **Security and privacy.**
   - Any path where API keys or the user's location could leak, for example into URLs, logs or third-party requests.
   - XSS through feed or geocoder strings. The code uses `textContent` for data, but please check every `innerHTML` use.
   - Service-worker cache poisoning.
3. **Robustness.**
   - Feed format changes.
   - Partial failures of Google, TomTom or OSRM.
   - Offline behaviour.
   - iOS Safari quirks: `DecompressionStream`, pointer events, PWA standalone.
4. **Performance on mid-range phones.** A 300 km radius returns ~2,000 stations, up to 300 Google overlay dots and an SVG chart over 30 days.
5. **Maintainability.** Concrete, incremental refactor suggestions that keep the no-build, single-file constraint. Splitting into a few ES modules served as static files is acceptable if worth it.

Out of scope:
- **Visual design changes**, unless they fix a usability bug.
- **Backend services, accounts, or anything that adds hosting cost.**

### How to run locally
- **App:** serve the folder with any static server (e.g. `python3 -m http.server`) and open `http://localhost:8000/`. Without a Google key it uses Esri tiles and OSRM.
- **Collector:** `python3 scripts/collect.py /tmp/data [optional_local_feed.geojson(.gz)]`. Run it twice with a modified feed to exercise the incremental path.
