# Tests

Deux suites, lancées automatiquement par GitHub (*Actions* → *Tests*) à chaque modification de `main` :

| Suite | Fichiers | Ce qu'elle vérifie |
|---|---|---|
| Collecteur (Python) | `test_collect.py` | Historique des prix : premier passage, changements, fichier inchangé ou plus ancien, fichier incomplet, doublons, horodatages invalides ou futurs, `meta.json` corrompu, fenêtre de 35 jours, identifiant de station |
| Navigateur (Playwright) | `app.spec.mjs`, `sw.spec.mjs` | Classement, médiane, géométrie, dates ; recherches près de moi et trajet ; courses entre recherches ; flux de la Régie partiel, ancien ou en panne ; délais réseau ; préférences corrompues ; infobulles sans HTML ; détours et disjoncteur ; faux Google (OK, refus, panne, retour) ; historique ; choix du centre et zones ; service worker et hors ligne |

Les scénarios reprennent les reproductions des trois revues de code (Codex, 2026-11-07). Aucun appel réseau réel : la Régie, Google, OSRM, Photon et l'historique sont simulés (`helpers.mjs`, `fixtures/gstub.js`).

## Lancer en local

```bash
# Collecteur (depuis la racine du dépôt)
python3 -m unittest discover -s tests -p "test_*.py" -v

# Navigateur (depuis tests/)
npm ci
npx playwright install chromium
npx playwright test
```
