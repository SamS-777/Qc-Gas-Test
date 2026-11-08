# Essence sur mon trajet

PWA personnelle (Sam, Montréal) : les stations-service les moins chères du Québec le long d'un trajet ou autour d'un point. Elle est publiée avec GitHub Pages à https://sams-777.github.io/Qc-Gas-Test/ (dépôt `SamS-777/Qc-Gas-Test`, branche `main`). Tout push sur `main` met le site en ligne.

Description technique complète : `APP_OVERVIEW.md` (anglais). Utilisation et fonctionnement de l'historique : `README.md`. Tests : `tests/README.md`.

## Façon de travailler

- **Langue :** Sam écrit en français. Réponses en français, concises et franches ; dire clairement quand on n'est pas sûr. Les textes de l'appli sont en français (avec une version anglaise, voir `data-i18n`).
- **Avant d'exécuter une tâche**, indiquer le modèle et l'effort recommandés (Sonnet effort moyen pour le courant ; Opus pour les refontes ou les analyses complexes).
- **Ne jamais inventer de données.** Pas de remplissage de l'historique avec des valeurs fabriquées. Si une affirmation n'est pas vérifiable, le dire ou l'enlever.
- **Les clés (Google, TomTom) ne vont jamais dans le code, les messages, les journaux ou les tests.** Elles vivent seulement dans le `localStorage` du navigateur de l'utilisateur.
- **Réglages Google Cloud** (restrictions de clé, quotas) : seulement avec l'accord explicite de Sam.
- **Pas de données confidentielles de son employeur** dans ce projet.
- **Pas de logos de marque** reproduits.

## Version de l'appli et nouveautés (obligatoire à chaque changement visible)

- `APP_VERSION` dans `index.html` : **1.0** depuis le 2026-11-08. Petite correction → `1.01`, `1.02`… ; nouveauté → `1.1`, `1.2`… ; grosse refonte → `2.0`. Ne jamais réutiliser un numéro.
- Ajouter une entrée **en tête** de `CHANGELOG` (même fichier) : numéro, date, titre et puces **en français et en anglais**, même nombre de puces. Écrit pour des gens qui ne connaissent pas la mécanique de l'appli : ce qu'ils peuvent faire de nouveau ou ce qui marche mieux, pas comment c'est fait.
- Au lancement suivant, chaque utilisateur voit une fenêtre « Quoi de neuf » avec les versions qu'il n'a pas encore vues. Le bouton `vX.Y` en haut ouvre l'historique complet.
- Un changement purement interne (tests, documentation, collecteur) ne change pas `APP_VERSION`.
- Monter aussi `VERSION` dans `sw.js` (numérotation séparée, voir ci-dessous).

## Architecture

- `index.html` : toute l'appli (HTML, CSS, JS), **sans build**, un seul fichier. Voulu : pas de dépendance d'outillage.
- `sw.js` : service worker. **Monter `VERSION` (ex. `essence-v24` → `v23`) à chaque modification de l'appli**, sinon les téléphones gardent l'ancienne version en cache. Mettre à jour aussi la mention dans `APP_OVERVIEW.md`.
- `vendor/leaflet/` : Leaflet 1.9.4 inclus dans le dépôt (aucun CDN pour la carte de secours).
- `scripts/collect.py` : collecteur d'historique, lancé par `.github/workflows/historique.yml` (cron `7,37 * * * *`), écrit dans la branche orpheline `historique`.
- Sources externes : flux de la Régie de l'énergie (`stations.geojson.gz`), Google Maps (carte et `Route.computeRoutes`), TomTom et OSRM (itinéraires), Photon (géocodage).

## Règles qui ont coûté cher (ne pas défaire)

- **Recherches asynchrones :** compteur de génération (`searchGen`, `busy`, `cancelSearch`) : une réponse tardive d'une ancienne recherche ne doit jamais écraser la récente.
- **Réseau :** passer par `fetchT` (délai sur la réponse entière, en-têtes et corps) ou `withTimeout`. Jamais de `fetch` nu.
- **Flux de la Régie :** `parseGen` strict ; refuser un flux plus ancien que celui en mémoire, futur, ou de moins de 500 stations. Chargement unique (`ensureStations`), reprise après 5 min (succès) ou 1 min (échec).
- **Détours :** disjoncteur par lot ; les erreurs propres à une station (`localErr`, ex. `NoRoute`) ne le déclenchent pas ; ne jamais mettre un échec en cache.
- **Collecteur :** les horodatages passent par `parse_time` (strict, indépendant de la version de Python : `strptime`, pas `fromisoformat`). La validation se fait **avant** le raccourci « inchangé ». Clé de station = `sha1(nom.lower()|adresse.lower())[:10]`, recalculée à l'identique dans `index.html` (`stationKey`) ; un test garantit l'égalité.
- **Branche `historique` :** compactée une fois par semaine par le workflow (un seul commit, données intactes). L'étiquette `historique-precedent` garde l'état d'avant. Ne pas pousser à la main sur cette branche.
- **Les tests marquent la version courante comme déjà vue** (`tests/helpers.mjs`), sinon la fenêtre « Quoi de neuf » bloquerait tous les clics. Pour tester un premier lancement : `open(page, { prefs: { seenVersion: undefined } })`.
- **Accessibilité :** champs d'adresse en combobox ARIA, cartes de résultats au clavier, modes « choisir le centre » et « dessiner » utilisables au clavier. Garder ces comportements en ajoutant des fonctions.

## Tests (obligatoires avant de pousser)

```bash
# Collecteur, depuis la racine
python3 -m unittest discover -s tests -p "test_*.py"
# Navigateur, depuis tests/ (première fois : npm ci && npx playwright install chromium)
npx playwright test
```

Aucun appel réseau réel dans les tests : tous les services sont simulés (`tests/helpers.mjs`, `tests/fixtures/gstub.js`). Tout bug corrigé reçoit un test qui échoue sans le correctif. La CI (`.github/workflows/tests.yml`) rejoue les deux suites à chaque push ; un ❌ veut dire que la version est mauvaise, ne pas s'y fier.

## Publier

Commit puis push sur `main`. Vérifier ensuite : CI verte, déploiement Pages réussi, et que `sw.js` en ligne a la nouvelle version. Écrire les messages de commit en français, à l'impératif ou au passé, avec le « pourquoi ».

## En suspens

- « Fais le plein maintenant ou attends ? » : modèle prédictif, après avoir exploré les CSV historiques de la Régie (prix moyen quotidien par région, IQCA, prix minimum estimé, prix à la rampe). Les prix de gros pilotent les prix à la pompe : un modèle sur les seuls prix affichés ne vaut pas grand-chose. Comparer à GasWizard avant de conclure. Voir `APP_OVERVIEW.md`.
- Pas demandé pour l'instant : avis de confidentialité ; passage aux modules ES (refonte, seulement si le fichier unique devient ingérable).
