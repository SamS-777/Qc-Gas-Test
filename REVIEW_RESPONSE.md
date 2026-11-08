# Réponse aux revues — Essence sur mon trajet

Ce fichier contient trois réponses, de la plus récente à la plus ancienne :
1. contre-revue de v20 → **v21** ;
2. contre-revue de v19 → v20 ;
3. première revue → v19.

---

## Réponse à la contre-revue v20 → version v21

- **Contre-revue :** « Contre-revue — Essence sur mon trajet, v20 », 2026-11-07 (0 P1, 5 P2, 3 P3).
- **Version corrigée :** service worker `essence-v21`, en ligne.
- **Position :** les 8 constats sont acceptés sans réserve. Trois d'entre eux (P2-1, P2-3, P2-5) sont des corrections v20 trop étroites ou trop larges.
- **Vérification :** chaque reproduction de la contre-revue a été rejouée telle que décrite. Toutes les suites antérieures repassent sans erreur JS : proximité, trajet, autres stations, historique, choix du centre, zones, favoris, carte Google simulée (valide, refusée, quota, sans clé), service worker, et scénarios des deux revues précédentes.

| # contre-revue v20 | Statut | Ce qui a changé | Vérification |
|---|---|---|---|
| P2-1 Adresse modifiée pendant `getRoutes()` | ✅ | Toute saisie dans Départ ou Destination pendant une recherche appelle `cancelSearch()`, qui incrémente la génération et réactive le bouton. La recherche en cours devient obsolète et ne rend rien. Le compteur des suggestions reste indépendant. | Reproduction exacte (départ `45.5000, -73.5000`, destination `45.6000, -73.6000`, OSRM retardé de 700 ms, destination remplacée après 150 ms) : `lastMode = null`, aucun résumé, bouton actif. Une nouvelle soumission calcule bien le trajet vers `[46, -74]`. |
| P2-2 `gm_authFailure` laisse `gmapsPromise` pendante | ✅ | Le callback rejette la promesse de chargement (`gDenied`), remet `gmapsPromise` à `null` et marque `googleBad`. `loadGoogle()` et chaque `importLibrary()` sont bornés à 15 s, dans `gCompute()` comme dans `googleAdapter()`. | Script Google simulé qui n'appelle **que** `gm_authFailure` : `loadGoogle()` est **rejetée** (« Clé Google refusée ») en moins de 600 ms, `gmapsPromise` nul, carte Esri, indicateur « Google indisponible ». |
| P2-3 Disjoncteur déclenché par un `NoRoute` | ✅ | Erreurs typées : `localErr()` marque les erreurs propres à une station (OSRM `code ≠ Ok` comme `NoRoute`, `NoSegment` ou `InvalidQuery` ; TomTom 400 ou réponse sans route ; Google sans route). Une erreur locale donne `null` pour cette station, avec essai du fournisseur suivant pour cette station seulement, sans couper le fournisseur. Seules les erreurs de portée fournisseur (délai, réseau, quota, refus, 5xx) déclenchent le disjoncteur. | `NoRoute` (HTTP 400) pour la 1re station seulement : 5 appels OSRM, 4 temps en voiture affichés (la 1re station n'a pas de badge). Le scénario « OSRM bloqué » donne toujours 5 badges résolus en 12 s. |
| P2-4 Collecteur : retour « inchangé » avant validation | ✅ | Ordre imposé : (1) `generated_at` **obligatoire**, parsé strictement, pas plus de 10 min dans le futur ; (2) l'heure de `meta.json` est elle-même validée, et si elle est invalide ou future, arrêt avec message de réparation ; (3) seulement ensuite, les tests « inchangé » et « plus ancien ». L'absence d'heure ne reçoit plus `now`. | Sans `generated_at` : refus (code 1). Flux 2099 : refus. `meta.json` à 2099 avec le même flux 2099 : refus (code 1, plus de faux succès). `meta.json` à 2099 avec un flux normal, ou `meta.json` illisible : refus avec instructions de réparation. Passage normal et passage inchangé : OK. |
| P2-5 Pas de pause après un premier échec sans données | ✅ | La pause s'applique dans tous les états. Pendant la pause : résolution immédiate s'il y a une copie, sinon rejet avec la **dernière erreur** mémorisée (`lastFeedError`), sans nouveau téléchargement. | Régie en 503 dès le démarrage, puis 3 clics sur Rechercher : 1 seul téléchargement au total, message d'erreur de la Régie affiché, bandeau « Prix indisponibles ». |
| P3-1 `parseGen()` non strict sur le calendrier | ✅ | Les composantes sont vérifiées une à une : mois 1–12, jour ≤ dernier jour du mois (années bissextiles comprises), heure ≤ 23, minutes et secondes ≤ 59, décalage ≤ 23:59. L'instant est construit avec `Date.UTC` ; `Date.parse` n'est plus utilisé. Le fuseau (`Z` ou décalage) est obligatoire. | 31 février, 29 février 2026, 31 avril, 24:00 et +25:00 → `NaN`. 29 février 2024, 7 décimales et `-05:00` → instants corrects. |
| P3-2 Fin de pause Google sans resynchronisation | ✅ | `markGoogle()` programme `googleBack()` à l'expiration de `googleDownUntil` ; la minuterie est annulée au changement de clé ou à un nouveau marquage. `googleBack()` met à jour l'indicateur, remet la carte Google si elle était passée sur Esri (sauf pendant le choix du centre ou le dessin d'une zone) et réaffiche les avertissements. | Carte Google simulée : `markGoogle("down")` → indicateur « Google indisponible » et minuterie posée. Après passage sur Esri pendant la panne puis expiration : indicateur « Google » et carte Google rétablie. |
| P3-3 `APP_OVERVIEW.md` : sémantique de `meta.json` | ✅ | Ligne alignée sur le README : dernier passage ayant traité un **nouveau** fichier ; la vivacité se vérifie dans *Actions*. | — |

### Fichiers modifiés en v21
- **`index.html`** : P2-1, P2-2, P2-3, P2-5, P3-1 et P3-2.
- **`scripts/collect.py`** : P2-4.
- **`APP_OVERVIEW.md`** : P3-3, plus la version.
- **`sw.js`** : version `essence-v21` uniquement.

---

## Réponse à la contre-revue v19 → version v20

- **Contre-revue :** « Contre-revue — Essence sur mon trajet, version corrigée v19 », 2026-11-07 (1 P1, 7 P2, 4 P3).
- **Version corrigée :** service worker `essence-v20`, en ligne.
- **Position :** les 12 constats sont acceptés. Deux d'entre eux sont des défauts introduits par la passe v19 (P2-5 et P2-6 de la contre-revue). Le refus initial de P3-9 (« Super 91 ») est **retiré** : sa justification reposait sur une définition de la Régie que je n'ai pas pu retrouver dans une source.
- **Vérification :** chaque reproduction de la contre-revue a été rejouée dans un navigateur (Playwright, réponses simulées et un serveur local qui envoie les en-têtes puis bloque le corps), ou en ligne de commande pour le collecteur. Toutes les suites précédentes repassent sans erreur JS.

| # contre-revue | Statut | Ce qui a changé | Vérification |
|---|---|---|---|
| P1-1 Flux complet mais plus ancien accepté | ✅ | `parseGen()` lit `metadata.generated_at` (ISO strict, toute longueur de fraction, `Z` ou décalage). Avant de remplacer les données : si des prix sont déjà en mémoire, un fichier sans heure, daté de plus d'1 h dans le futur ou **plus ancien** que celui en mémoire est refusé, et l'ancien est conservé. La fraîcheur affichée repose sur `generatedMs`, plus sur l'heure de téléchargement. Avertissements : « non rafraîchis (N min) » si l'actualisation échoue ou si l'âge dépasse 30 min ; « prix datés de *date heure* » au-delà de 2 h ; « heure inconnue » si le premier fichier n'a pas d'heure valide. Le bandeau montre la date quand ce n'est pas aujourd'hui. | Fichier récent chargé, puis fichier complet daté de la veille au rafraîchissement : rejeté, `generatedMs` inchangé, avertissement affiché. Premier fichier daté de 2099 : accepté faute d'alternative, avec « Heure des prix de la Régie inconnue ». |
| P2-1 Délai limité aux en-têtes | ✅ | `fetchT()` lit et décode le corps **dans** le même `try/finally` que le minuteur. Retour `{ok, status, data}`, avec un mode `json`, `json?` (TomTom : `{}` si le JSON est invalide) ou `buffer` (Régie). Tous les appels ont été adaptés. | Serveur local qui envoie `200` puis un corps jamais terminé : erreur « n'a pas répondu à temps » après 1,5 s, en mode JSON comme en mode buffer. |
| P2-2 Chargements en double, sans délai de reprise | ✅ | Un seul téléchargement partagé (`stationLoad`) entre le démarrage et les recherches ; le démarrage passe par `ensureStations()`. Prochain essai 5 min après un succès, 1 min après un échec ; entre-temps, les recherches utilisent les prix en mémoire sans réattendre. `freshState = "down"` seulement s'il n'y a **aucune** donnée. | Recherche lancée pendant le premier téléchargement (ralenti de 1,2 s) : 1 seule requête. Rafraîchissement en échec puis 3 recherches rapprochées : 1 seule tentative, état non « down », résultats affichés. |
| P2-3 Échecs Google autres que `gm_authFailure` | ✅ | `markGoogle(kind)` centralise les échecs. `denied` met `googleBad` (définitif jusqu'au changement de clé). `quota` (10 min) et `down` (2 min, pour un script injoignable, une erreur ou un délai) mettent `googleDownUntil`. `googleOn()` tient compte des deux. `script.onerror` remet `gmapsPromise` à `null` et retire la balise, pour permettre un nouvel essai. `gError()` classe chaque erreur de `computeRoutes`. Le `catch` d'`initMap()` marque la panne et synchronise l'indicateur. Avertissements distincts : refus de clé, ou panne temporaire. | Script Google bloqué, clé présente : carte Esri, indicateur « Google indisponible », `googleDownUntil` à +120 s, avertissement présent. Scénarios simulés « clé refusée » et « quota » repassés. |
| P2-4 Mutations hors génération (`geocode`, `routeNote`) | ✅ | `geocode()` n'a plus d'effet de bord : il retourne `{…, q, found}`, et l'appelant appelle `commitPick()` seulement si sa recherche est courante **et** si le texte du champ n'a pas changé. `getRoutes()` retourne `{routes, note}` ; plus de variable globale `routeNote`. La note de repli s'ajoute aux avertissements durables dans `noteText()` au lieu de les remplacer. | Géocodage ralenti, champ modifié pendant l'attente : ni indice ni `picked` réécrits. Scénario quota : la note de repli et l'avertissement sur les prix s'affichent ensemble. |
| P2-5 Rabais restauré jusqu'à 99 ¢ | ✅ | Constante unique `MAX_REBATE = 50`, partagée par l'attribut de saisie, le gestionnaire et le chargement. Les valeurs hors limite sont rejetées et la forme normalisée est réécrite dans le stockage. | `{"Shell":99,"Esso":5,"Ultramar":50.5}` au démarrage → `{"Esso":5}` en mémoire et dans le stockage. |
| P2-6 Jeton de reprise global aux trois carburants | ✅ | Un jeton par carburant (`histTry[code]`). La reprise relance aussi le rendu. | R en échec, passage à S (chargé), attente de 61 s, retour à R : nouvelle requête R envoyée (2 au total). |
| P2-7 Horodatages invalides ou futurs acceptés par le collecteur | ✅ | Le fallback qui tronquait a été supprimé. Une expression régulière stricte valide le format, la fraction est ramenée à 6 chiffres (compatible Python 3.9), puis `fromisoformat` rejette un décalage impossible. Une forme invalide ou une date à plus de 10 min dans le futur ⇒ refus, code de sortie 1 (la tâche GitHub échoue visiblement), **avant toute écriture**. | Valeur réelle à 7 décimales acceptée ; `-04:00` converti ; `+25:00`, `NOT-ISO` et `2099-…` refusés sans écriture ; fichier antérieur ignoré ; `meta.json` intact. |
| P3-1 Cache de détours étiqueté par le fournisseur demandé | ✅ | La valeur est enregistrée avec le fournisseur **effectif** (`pv`). Réutilisation : 10 min si `pv` est le fournisseur prioritaire actuel, 2 min pour un repli, et seulement si `pv` fait encore partie de la chaîne. Les échecs ne sont plus mis en cache. La clé inclut le fournisseur du trajet choisi. | Revue de code et suites de détours. |
| P3-2 Détours séquentiels, budget jusqu'à 220 s | ✅ | Disjoncteur par lot : un fournisseur qui échoue ou expire n'est plus sollicité pour les stations suivantes. Pire cas ≈ un délai par fournisseur (Google 20 s, TomTom 12 s, OSRM 12 s), soit environ 44 s au lieu de 220 s. Une panne Google est aussi mémorisée par `markGoogle` pour les recherches suivantes. La séquentialité est conservée par respect des services publics. Commentaire ajouté : `withTimeout` cesse d'attendre Google mais n'annule pas l'opération. | OSRM bloqué 30 s sur les calculs de temps : les 5 badges sont résolus en 12 s (au lieu de 60 s). |
| P3-3 Documentation de `meta.json` | ✅ | README corrigé : le fichier indique le dernier passage ayant traité un **nouveau** fichier de la Régie ; pour savoir si la collecte tourne, il faut regarder l'onglet *Actions*. | — |
| P3-4 « Super 91 » | ✅ (refus retiré) | Libellé « Super » (FR) / « Premium » (EN), avec l'infobulle « Indice d'octane non précisé par la Régie ». La documentation a été alignée. | — |

### Fichiers modifiés en v20
- **`index.html`** : tous les points ci-dessus, sauf P2-7 et P3-3.
- **`sw.js`** : version `essence-v20` uniquement.
- **`scripts/collect.py`** : P2-7.
- **`README.md`** : P3-3.
- **`APP_OVERVIEW.md`** : sections mises à jour, plages de lignes de v20.

---

# Réponse initiale à la première revue (v19)

- **Revue d'origine :** « Revue exhaustive — Essence sur mon trajet », 2026-11-07.
- **Version corrigée :** service worker `essence-v19` (remplacée depuis par v20, voir plus haut). Le site est https://sams-777.github.io/Qc-Gas-Test/.
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
| P3-9 « Super 91 » trop précis | ❌ → ✅ en v20 | ~~Refus initial.~~ La justification (une définition de la Régie) n'a pas pu être sourcée : refus retiré, voir la réponse v20 (P3-4). |
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
