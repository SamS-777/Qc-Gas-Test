# Réponse à la revue — Essence sur mon trajet

- **Revue d'origine :** « Revue exhaustive — Essence sur mon trajet », 2026-11-07.
- **Version corrigée :** celle de ce paquet (service worker `essence-v19`). Elle est en ligne sur https://sams-777.github.io/Qc-Gas-Test/.
- **Statuts utilisés :**
  - ✅ **Corrigé**
  - 🟡 **Partiel / requalifié** : corrigé autrement que proposé, ou gravité revue
  - ⏳ **Reporté** : valide, prévu dans un lot ultérieur
  - ❌ **Non retenu** : avec la justification

Chaque correction a été vérifiée par un test navigateur ciblé (Playwright, réponses réseau simulées) ou par un test du collecteur, décrit dans la colonne « Vérification ». Les suites de non-régression existantes ont été relancées et passent sans erreur JS :
- proximité et trajet ;
- autres stations ;
- graphique d'historique ;
- choix du centre et zones dessinées ;
- favoris ;
- carte Google simulée : clé valide, refusée, quota, sans clé ;
- mobile 390 × 844 en clair et en sombre.

**Ce qu'on attend de la contre-revue :**
1. Confirmer que chaque ✅ est réellement corrigé, sans régression.
2. Contester les 🟡 et ❌ si la justification ne tient pas.
3. Signaler tout nouveau problème introduit par ces changements.

---

## P1

| # | Statut | Ce qui a changé | Vérification |
|---|---|---|---|
| P1-1 Course recherche / changement de mode | ✅ | Compteur de génération `searchGen` (section Événements). Chaque soumission capture son numéro. `setMode()` appelle `cancelSearch()`, qui incrémente le compteur et réactive le bouton. Après chaque `await` (prix, géocodage, trajets), une recherche obsolète s'arrête **avant** toute écriture d'état (`lastA`, `lastB`, `lastRoutes`, `lastMode`) et ne touche ni au statut ni au bouton. Les zones (`runZone`) et les favoris passent par le même compteur. Une nouvelle recherche remplace la précédente au lieu d'être bloquée. | Trajet lancé avec OSRM retardé de 2,5 s, puis bascule immédiate en « Près de moi ». Résultat : formulaire en proximité, `lastMode = null`, aucun résumé ni trajet affiché, bouton actif. La recherche de proximité suivante fonctionne. |
| P1-2 Détour négatif ou comparé à un autre itinéraire | 🟡 | **Requalifié en P3.** Le cas ne survient que si l'utilisateur choisit une alternative plus lente que la meilleure. La définition voulue reste « coût de l'arrêt par rapport au trajet choisi ». Quand l'écart est négatif de plus de 30 s, l'appli affiche maintenant « ≈ 0 · par un autre chemin » au lieu d'un faux « Aucun détour ». Les kilomètres négatifs sont affichés avec leur signe au lieu d'être omis. Les itinéraires ne sont pas contraints par des points d'ancrage : coût en appels et complexité jugés disproportionnés. | Revue de code de `paintDetour`. |
| P1-3 Le service worker efface les caches des autres apps | ✅ | Préfixe `essence-`. L'activation ne supprime que `key.startsWith("essence-") && key !== VERSION`. | Test en `localhost` avec des caches `other-app-v1` et `essence-v18` préexistants. Après activation : `other-app-v1` est conservé, `essence-v18` est supprimé, `essence-v19` est créé. |
| P1-4 Leaflet distant sans contrôle d'intégrité | ✅ | Leaflet 1.9.4 est hébergé dans `vendor/leaflet/` : JS, CSS, images des contrôles et licence. Les fichiers sont identiques octet pour octet à l'archive npm officielle (`npm pack leaflet@1.9.4` puis `cmp`). unpkg n'est plus référencé nulle part. **CSP non ajoutée :** l'API Google Maps JS exige de nombreux domaines et des styles en ligne, donc une CSP stricte casserait la carte Google ; elle est reportée et à concevoir avec la liste de Google. **Formulation sur les clés** : la doc dit déjà qu'elles sont envoyées à leur fournisseur respectif. | `grep unpkg` vide. Rechargement hors ligne : `typeof L === "object"`. |
| P1-5 Flux de prix partiel ou indisponible | ✅ | `compact()` rejette les coordonnées non finies ou hors d'une boîte large autour du Québec. Moins de 500 stations ⇒ erreur, **avant** le remplacement de `stations` : les anciennes données restent. Nouvelle fonction `ensureStations()` : si un rafraîchissement échoue alors que des prix existent, la recherche continue avec un avertissement durable (« prix d'il y a N min »), réaffiché après chaque rendu via `noteText()`. Délai de 25 s sur le téléchargement. | Flux d'une seule station au démarrage : message « fichier incomplet (1 station lue) », aucun résultat. Flux en erreur 503 avec des données âgées de 12 min : résultats affichés et avertissement « prix d'il y a 12 min ». |

## P2

| # | Statut | Ce qui a changé | Vérification |
|---|---|---|---|
| P2-1 Repli Google trompeur | ✅ | `syncKey()` tient compte de `googleBad` (« Google indisponible · TomTom »). `onGoogleFail()` appelle `syncKey()`. L'avertissement de repli est durable (`noteText()`) et n'est plus effacé par `render()`. | Scénario clé refusée sur la carte simulée : indicateur « Google indisponible · TomTom » et avertissement toujours présent après une recherche de trajet puis de proximité. |
| P2-2 Nom de zone appliqué à la mauvaise zone | ✅ | Le callback compare l'identité du polygone (`lastPoly === mine`). | Revue de code. |
| P2-3 Cache de détours périmé | ✅ | Entrées `{v, at}` avec une durée de vie de 10 min, plafond de 300 entrées (la plus ancienne sort), cache vidé à chaque modification d'une clé Google ou TomTom. Le fournisseur de repli peut encore être enregistré sous la clé du premier fournisseur de la chaîne, mais pour 10 min au plus. Jugé acceptable. | Revue de code et suites de détours. |
| P2-4 Aucun délai réseau | 🟡 | `fetchT()` (AbortController + délai) sur **tous** les `fetch` : Régie 25 s ; TomTom 20 s ; OSRM, Photon, Nominatim et historique 8 à 15 s. `Route.computeRoutes` de Google est enveloppé dans `withTimeout(…, 20 s)`. **Non fait :** l'annulation des requêtes d'une recherche devenue obsolète. Le compteur de génération (P1-1) suffit pour l'exactitude ; les requêtes orphelines se terminent ou expirent seules. | Suites existantes. Délai observé sur OSRM retardé. |
| P2-5 Préférences et données externes non validées | ✅ | `brandsOff` (tableau de chaînes), `rebates` (objet de nombres de 0 à 100 exclu) et `favs` (mode, points ou polygone valides) sont filtrés au chargement. Les coordonnées saisies directement sont contrôlées en plage. | `localStorage` corrompu avant le démarrage (`favs = {"a":1}`, `rebates = [1,2,"x"]`, `brandsOff = "Shell"`, `fillL = 99999`) : démarrage sans erreur, recherche fonctionnelle. |
| P2-6 Infobulle de trajet Leaflet interprétée comme du HTML | ✅ | L'infobulle reçoit un nœud DOM rempli par `textContent`. | Infobulle forcée à `<img src=x onerror=…><b>bold</b>` puis survolée : le HTML est échappé et le script ne s'exécute pas. |
| P2-7 Politique de cache PWA fragile | ✅ | Le shell minimal est obligatoire (`addAll`) et les extras sont facultatifs. La navigation n'enregistre que des réponses `ok` en `text/html`, avec `await cache.put`. La revalidation passe par `event.waitUntil`. Les fichiers locaux ne sont mis en cache que si `ok`. Les recherches de cache se limitent au cache de l'appli. | Test SW : contenu du shell vérifié et rechargement hors ligne fonctionnel. |
| P2-8 Historique : validation et fraîcheur | ✅ | Validation légère (`t0` numérique, `s` objet, tableaux pairs de nombres). Durée de vie de 10 min : l'ancienne version reste affichée pendant le rechargement. La nouvelle tentative après échec est liée à son numéro de tentative. Pendant une panne, aucun nouvel essai à chaque rendu. | Suite du graphique (7 j / 30 j, zone et station, carburant). |
| P2-9 `meta.json` non mis à jour si le flux est inchangé | ❌ | Le cas ne se produit pratiquement pas : la Régie régénère son fichier toutes les 5 min et la collecte tourne au mieux toutes les 30 min. Écrire `meta.json` à chaque passage créerait en plus un commit à chaque passage, ce qui aggrave P3-11. La vivacité se vérifie dans l'onglet *Actions* de GitHub. | — |
| P2-10 Horodatage régressif ou avec décalage | ✅ | `parse_time()` lit l'ISO complet (`Z` ou décalage) et convertit en UTC ; un format inattendu retombe sur les secondes en UTC. Un `generated_at` antérieur au dernier enregistré est ignoré avec un message. | Collecteur : même fichier → « inchangé » ; fichier antérieur → « ignoré » ; fichier `-04:00` → converti correctement. La vraie valeur de la Régie, avec 7 décimales, est lue sans erreur. |
| P2-11 Identité des stations et doublons silencieux | 🟡 | Les doublons sont maintenant **signalés** dans le journal de collecte. **Constat :** 0 doublon nom + adresse sur les 2 463 stations du flux réel testé. 40 bits sur environ 2 500 clés donnent une probabilité de collision négligeable (environ 3 × 10⁻⁶). Pas de changement d'identité, qui casserait la continuité de l'historique déjà collecté. | Flux avec une station dupliquée : message « 1 station(s) en double ». |
| P2-12 Reconstruction si un fichier d'historique est corrompu | ⏳ | Lot B. Aujourd'hui, une corruption fait échouer la tâche de façon visible (courriel GitHub) sans écrire de données fausses. | — |
| P2-13 Accessibilité : statuts et autocomplétion | 🟡 | `#status` a maintenant `role="status"` et `aria-live="polite"`. Le modèle ARIA combobox de l'autocomplétion est reporté au lot B. | — |
| P2-14 Accessibilité clavier | ⏳ | Lot B. | — |
| P2-15 Contrastes | ✅ | `--faint` clair passe de `#9C9A92` à `#73716A` : 4,88:1 sur la surface et 4,64:1 sur le fond. `--faint` sombre passe de `#8A877F` à `#A3A097` : 5,06:1 sur la surface. `--route` clair passe de `#2F6BDB` à `#2A62CC` : 4,75:1 sur `--route-soft`. Ratios WCAG calculés. | Calcul automatisé des ratios. |
| P2-16 Confidentialité | 🟡 | Le biais envoyé à Photon est arrondi à 2 décimales (environ 1 km). Pas encore de notice de confidentialité (lot B). Pas de `Referrer-Policy` plus stricte : le défaut des navigateurs (`strict-origin-when-cross-origin`) n'envoie que l'origine, et c'est nécessaire à la restriction des clés Google par référent. | Revue de code. |
| P2-17 Performance des longs trajets | ❌ (en l'état) | Un préfiltre par boîte englobante écarte déjà la majorité des stations avant le calcul de distance au tracé. Le coût n'a pas été mesuré comme problématique sur un trajet Montréal–Québec. Une optimisation n'est prévue qu'après une mesure. Le graphique de zone (≤ 2 000 × 360) n'est calculé qu'à l'ouverture du panneau replié. | — |
| P2-18 Aucun test automatisé dans le dépôt | ⏳ | Lot B, prioritaire : fonctions pures extraites, `node --test`, `unittest` pour le collecteur et 4 à 6 scénarios Playwright dans Actions. | — |

## P3

| # | Statut | Commentaire |
|---|---|---|
| P3-1 Plein non plafonné | ✅ | Plafond de 1 à 200 L dans `opts()`. Vérifié : `fillL = 99999` donne « Plein de 200 L ». |
| P3-2 Géolocalisation sans âge ni précision | ⏳ | Valide, faible impact. |
| P3-3 Favoris incomplets (alternative, origine des zones) | ⏳ | Comportement documenté ; à reconsidérer si demandé. |
| P3-4 Initialisation de la carte peu défensive | ✅ | `initMap().catch(…)` au démarrage. Les boutons « Choisir le centre » et « Dessiner une zone » affichent « La carte n'est pas disponible » au lieu de ne rien faire. |
| P3-5 Détours séquentiels | ❌ | Volontaire : les services publics (OSRM) imposent un débit modéré. Le délai par requête (P2-4) empêche un blocage. |
| P3-6 Diagnostics PWA invisibles | ⏳ | — |
| P3-7 Google Maps en canal `weekly` | ❌ (pour l'instant) | La classe `Route` de la bibliothèque `routes` n'est peut-être pas disponible sur le canal trimestriel ; ça n'a pas été vérifié. Changer de canal risque de casser les trajets. À réévaluer avec des tests automatisés. |
| P3-8 Manifeste en français seulement | ❌ | Public francophone, l'anglais est secondaire. |
| P3-9 « Super 91 » trop précis | ❌ | La Régie définit elle-même l'essence super comme le 91 dans ses données : le libellé reflète la source. |
| P3-10 Fuseau et horloge de l'appareil | ⏳ | Le public cible est au Québec. Faible impact. |
| P3-11 Croissance de la branche `historique` | ⏳ | Valide. Compactage périodique de la branche prévu (lot B). |
| P3-12 Action GitHub non épinglée par SHA | ❌ | Action officielle `actions/checkout@v4`. Valeur faible pour ce projet. |
| P3-13 Architecture monolithique | ⏳ | Découpage progressif en modules ES statiques, après la mise en place des tests (lot B). |

## Fichiers modifiés

- **`index.html`** : P1-1, P1-2, P1-4, P1-5, P2-1 à P2-8, P2-13 (partiel), P2-15, P2-16 (partiel), P3-1 et P3-4.
- **`sw.js`** : réécrit (P1-3, P2-7), `essence-v19`.
- **`vendor/leaflet/`** : nouveau (P1-4).
- **`scripts/collect.py`** : `parse_time`, garde contre les flux antérieurs et signalement des doublons (P2-10, P2-11).
- **`README.md` et `APP_OVERVIEW.md`** : mis à jour.
- **`.github/workflows/historique.yml`** : inchangé.
