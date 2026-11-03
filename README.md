# Essence sur mon trajet

Application web installable qui montre les stations-service les moins chères sur ton trajet ou près de toi, avec les prix déclarés à la Régie de l'énergie du Québec (mis à jour aux 5 minutes).

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | L'application complète |
| `manifest.webmanifest` | Nom, icônes et couleurs pour l'installation sur téléphone |
| `sw.js` | Démarrage instantané et ouverture hors connexion (les prix restent toujours en direct) |
| `icons/` | Icônes de l'application |

## Mise en ligne avec GitHub Pages (gratuit, environ 10 minutes)

1. **Créer le compte.** Va sur github.com → *Sign up*. Ton nom d'utilisateur fera partie de l'adresse de l'appli : `https://TON-NOM.github.io/essence/`.
2. **Créer le dépôt.** En haut à droite, **+** → *New repository*. Nom : `essence`. Visibilité : *Public* (obligatoire pour GitHub Pages gratuit ; le code ne contient aucune clé ni donnée personnelle). Clique *Create repository*.
3. **Téléverser les fichiers.** Sur la page du dépôt vide, clique le lien *uploading an existing file*. Glisse **le contenu** du dossier dézippé : `index.html`, `manifest.webmanifest`, `sw.js`, `README.md` et le dossier `icons`. Clique *Commit changes*.
4. **Activer le site.** *Settings* → *Pages* (menu de gauche). Sous *Build and deployment* → *Source* : *Deploy from a branch*. *Branch* : `main`, dossier `/ (root)` → *Save*. Après une ou deux minutes, l'adresse du site s'affiche en haut de cette page.

## Installer l'appli sur ton téléphone

- **iPhone :** ouvre l'adresse dans **Safari** → bouton Partager → *Sur l'écran d'accueil*.
- **Android :** ouvre l'adresse dans **Chrome** → menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).

Ensuite, dans l'appli installée : ouvre *Circulation en direct* et colle ta clé TomTom une seule fois. Tes favoris, rabais et bannières sont à refaire sur le téléphone : chaque appareil garde ses propres réglages.

## Protéger ta clé TomTom (recommandé)

Sur my.tomtom.com → *API & SDK Keys* → menu **…** à côté de ta clé → active la liste blanche de domaines (*domain whitelist*) et ajoute `TON-NOM.github.io`. La clé ne fonctionnera alors que depuis ton site.

Attention : avec la liste blanche active, la version fichier ouverte sur ton PC ne pourra plus utiliser TomTom. Elle passera automatiquement à OSRM, sans la circulation.

## Mettre à jour l'appli

Dans le dépôt : *Add file* → *Upload files* → glisse le nouveau `index.html` → *Commit changes*. La nouvelle version apparaît à la prochaine ouverture de l'appli, s'il y a du réseau.

Si `sw.js` change aussi, téléverse-le de la même façon.

## Sources de données

- Prix : Régie de l'énergie du Québec (regieessencequebec.ca)
- Trajets : TomTom (circulation en direct, avec ta clé) ou OSRM
- Adresses : Photon / OpenStreetMap
- Carte : Esri
