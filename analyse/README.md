# Analyses : « quand faire le plein ? »

Scripts d'exploration, hors de l'appli. Ils ne modifient rien dans le dépôt ; les fichiers téléchargés vont dans `analyse/donnees/` (ignoré par git). Dépendances : `pandas`, `numpy`, et `pdftotext` pour le second.

## 1. Cycle dans la journée (`cycle_horaire.py`)

Lit l'historique collecté (branche `historique`) et donne, par région : l'écart moyen entre le creux et le sommet du prix médian dans une journée, l'heure la moins chère, et le nombre de jours où le soir (19 h–22 h) est moins cher que le matin (1 h–8 h).

```bash
git fetch origin historique
mkdir -p analyse/donnees/historique
git archive origin/historique data | tar -x -C analyse/donnees/historique
python3 analyse/cycle_horaire.py analyse/donnees/historique/data
```

## 2. Prévision sur plusieurs jours (`regie_quotidien.py`)

Télécharge les moyennes quotidiennes par région, l'IQCA et le prix à la rampe publiés par la Régie, puis teste sur le passé un signal « attendre ou non » réentraîné chaque mois sur le passé seulement.

```bash
python3 analyse/regie_quotidien.py telecharger
python3 analyse/regie_quotidien.py test Montréal 0
```

## Résultats du 2026-11-17

**Cycle dans la journée** (8 jours complets, du 8 au 15 novembre 2026) :

| Région | Écart creux-sommet (médiane) | Heure la moins chère | Soir moins cher que le matin |
|---|---|---|---|
| Laval | 14,0 ¢ | vers 21 h | 8 jours sur 8 |
| Montréal | 7,5 ¢ | vers 21 h | 8 jours sur 8 |
| Montérégie | 4,7 ¢ | vers 21 h | 8 jours sur 8 |
| Laurentides | 3,9 ¢ | vers 20 h | 8 jours sur 8 |
| Capitale-Nationale | 1,6 ¢ | pas de motif | 3 jours sur 8 |

À Montréal et à Laval, environ 70 % des stations remontent leur prix entre 23 h et 1 h, 8 nuits sur 9 ; les prix redescendent ensuite jusqu'au soir.

**Prévision sur plusieurs jours** (Montréal, moyennes quotidiennes 2023 à octobre 2026) : le signal gagne entre −0,1 et +0,3 ¢/L selon l'année, ce qui ne se distingue pas du hasard. Même une prévision parfaite sur 3 jours ne rapporterait que 1,1 à 2,4 ¢/L. Une moyenne par jour et par région efface le cycle nocturne.

## Limites

- Huit jours seulement, pendant une période où le prix de gros baissait. À refaire après quelques semaines de collecte avant d'en tirer une fonction dans l'appli.
- Ce sont les prix déclarés à la Régie, pas vérifiés à la pompe. Le collecteur passe aux 30 minutes.
- L'IQCA quotidien n'est plus publié depuis le 2025-06-13. Le prix à la rampe quotidien n'existe qu'en PDF, avec quelques jours de retard.
