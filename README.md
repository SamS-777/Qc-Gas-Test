# Essence sur mon trajet

Application web installable qui montre les stations-service les moins chères sur ton trajet ou près de toi, avec les prix déclarés à la Régie de l'énergie du Québec (mis à jour aux 5 minutes).

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | L'application complète |
| `manifest.webmanifest` | Nom, icônes et couleurs pour l'installation sur téléphone |
| `sw.js` | Démarrage instantané et ouverture hors connexion (les prix restent toujours en direct) |
| `icons/` | Icônes de l'application |
| `vendor/leaflet/` | Bibliothèque de carte Leaflet 1.9.4, hébergée dans le dépôt (plus de dépendance à unpkg) |
| `scripts/collect.py`, `.github/workflows/historique.yml` | Collecte de l'historique des prix (voir plus bas) |

## Mise en ligne avec GitHub Pages (gratuit, environ 10 minutes)

1. **Créer le compte.** Va sur github.com → *Sign up*. Ton nom d'utilisateur fera partie de l'adresse de l'appli : `https://TON-NOM.github.io/essence/`.
2. **Créer le dépôt.** En haut à droite, **+** → *New repository*. Nom : `essence`. Visibilité : *Public* (obligatoire pour GitHub Pages gratuit ; le code ne contient aucune clé ni donnée personnelle). Clique *Create repository*.
3. **Téléverser les fichiers.** Sur la page du dépôt vide, clique le lien *uploading an existing file*. Glisse **le contenu** du dossier dézippé : `index.html`, `manifest.webmanifest`, `sw.js`, `README.md` et le dossier `icons`. Clique *Commit changes*.
4. **Activer le site.** *Settings* → *Pages* (menu de gauche). Sous *Build and deployment* → *Source* : *Deploy from a branch*. *Branch* : `main`, dossier `/ (root)` → *Save*. Après une ou deux minutes, l'adresse du site s'affiche en haut de cette page.

## Installer l'appli sur ton téléphone

- **iPhone :** ouvre l'adresse dans **Safari** → bouton Partager → *Sur l'écran d'accueil*.
- **Android :** ouvre l'adresse dans **Chrome** → menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).

Ensuite, dans l'appli installée : ouvre *Circulation en direct* et colle ta clé TomTom une seule fois. Tes favoris, rabais et bannières sont à refaire sur le téléphone : chaque appareil garde ses propres réglages.

## Clé Google Maps (optionnelle, prioritaire sur TomTom)

Avec une clé Google, l'appli utilise les trajets Google avec la circulation et affiche la carte Google. Sans clé Google, ou si Google refuse, elle passe à TomTom, puis à OSRM.

Dans Google Cloud Console (console.cloud.google.com) :

1. **Projet :** crée un projet (ex. `essence`).
2. **Facturation :** active la facturation sur ce projet (carte obligatoire, même pour le palier gratuit).
3. **API :** dans *API et services* → *Bibliothèque*, active **Maps JavaScript API** et **Routes API**.
4. **Clé :** *API et services* → *Identifiants* → *Créer des identifiants* → *Clé API*.
5. **Restreindre la clé** (même écran, modifier la clé) :
   - *Restrictions relatives aux applications* : **Sites Web** → ajoute `https://sams-777.github.io/*`
   - *Restrictions relatives aux API* : **Maps JavaScript API** et **Routes API** seulement.
6. **Plafonds quotidiens** (ce qui empêche vraiment de payer) : *API et services* → **Routes API** → onglet *Quotas* → limite **par jour** des requêtes de calcul de trajet : `160`. Même chose pour **Maps JavaScript API** (chargements de carte par jour) : `300`.
7. **Alerte budgétaire :** *Facturation* → *Budgets et alertes* → budget de `1 $` avec alerte. Elle prévient seulement, elle ne bloque pas : ce sont les quotas de l'étape 6 qui bloquent.

Colle ensuite la clé dans l'appli : *Circulation en direct* → *Clé Google Maps*.

Repères : chaque recherche fait environ 6 calculs de trajet avec circulation (1 trajet + 5 détours). Le palier gratuit en couvre 5 000 par mois, soit environ 830 recherches.

## Protéger ta clé TomTom (recommandé)

Sur my.tomtom.com → *API & SDK Keys* → menu **…** à côté de ta clé → active la liste blanche de domaines (*domain whitelist*) et ajoute `TON-NOM.github.io`. La clé ne fonctionnera alors que depuis ton site.

Attention : avec la liste blanche active, la version fichier ouverte sur ton PC ne pourra plus utiliser TomTom. Elle passera automatiquement à OSRM, sans la circulation.

## Mettre à jour l'appli

Dans le dépôt : *Add file* → *Upload files* → glisse le nouveau `index.html` → *Commit changes*. La nouvelle version apparaît à la prochaine ouverture de l'appli, s'il y a du réseau.

Si `sw.js` change aussi, téléverse-le de la même façon. Le dossier `vendor/` ne change que si on met Leaflet à jour.

## Historique des prix

Une tâche automatique (*Actions* → *Historique des prix*) lit le fichier de la Régie toutes les 30 minutes et enregistre les changements de prix dans la branche **`historique`**. La branche `main`, qui fait tourner le site, n'est pas touchée.

| Fichier (branche `historique`) | Contenu |
|---|---|
| `data/changes/AAAA-MM.csv` | Chaque changement : heure (UTC), station, carburant (R/S/D), prix en ¢/L (vide = plus disponible) |
| `data/state.jsonl` | Dernier prix connu, nom, bannière, adresse, région et position de chaque station |
| `data/summary/regions.json` | Par jour, région et carburant : min, 1er quartile, médiane, 3e quartile, max, nombre de stations |
| `data/meta.json` | Dernier passage ayant traité un **nouveau** fichier de la Régie (un passage sans nouveau fichier ne le modifie pas). Pour savoir si la collecte tourne, regarder l'onglet *Actions* |

- **Pour arrêter :** *Actions* → *Historique des prix* → **⋯** → *Disable workflow*.
- **Pour relancer à la main :** même endroit → *Run workflow*.
- Le premier passage enregistre toutes les stations. Avec les changements suivants, on peut reconstituer le prix de n'importe quelle station à n'importe quel moment depuis le début de la collecte.
- GitHub peut retarder les passages de 10 à 30 minutes aux heures chargées.

## Sources de données

- Prix : Régie de l'énergie du Québec (regieessencequebec.ca)
- Trajets : Google (avec ta clé), sinon TomTom (avec ta clé), sinon OSRM sans circulation
- Adresses : Photon / OpenStreetMap (Nominatim en secours)
- Carte : Google (avec ta clé) ou Esri
- Historique : branche `historique` du dépôt (voir plus haut)

Description technique complète : `APP_OVERVIEW.md`.
