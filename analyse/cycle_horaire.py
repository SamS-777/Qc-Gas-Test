#!/usr/bin/env python3
"""Cycle des prix dans la journée, par région, à partir de l'historique collecté (branche « historique »).

Question : à quelle heure l'essence ordinaire est-elle la moins chère, et l'écart est-il régulier ?

Usage (depuis la racine du dépôt) :
    git fetch origin historique
    mkdir -p analyse/donnees/historique
    git archive origin/historique data | tar -x -C analyse/donnees/historique
    python3 analyse/cycle_horaire.py analyse/donnees/historique/data [Région ...]

Dépendances : pandas, numpy. Lecture seule ; n'écrit rien.
"""
import glob, json, os, sys, warnings
import numpy as np, pandas as pd

warnings.filterwarnings("ignore")
TZ = "America/Toronto"
SOIR, MATIN = [19, 20, 21, 22], [1, 2, 3, 4, 5, 6, 7, 8]


def charger(data):
    st = {}
    with open(os.path.join(data, "state.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line); st[d["k"]] = d.get("r", "")
    ch = pd.concat(pd.read_csv(p) for p in sorted(glob.glob(os.path.join(data, "changes", "*.csv"))))
    ch = ch[ch.carburant == "R"].copy()
    ch["t"] = pd.to_datetime(ch.t, utc=True)
    ch["reg"] = ch.station.map(st).fillna("")
    return ch


def grille(ch, region, pas="30min"):
    """Prix de chaque station sur une grille régulière (le prix reste le même jusqu'au changement suivant)."""
    g = pd.date_range(ch.t.min().ceil(pas), ch.t.max().floor(pas), freq=pas)
    w = ch[ch.reg == region].pivot_table(index="t", columns="station", values="prix", aggfunc="last", dropna=False)
    w = w.reindex(w.index.union(g)).ffill().reindex(g).dropna(axis=1, thresh=int(len(g) * 0.8))
    w.index = w.index.tz_convert(TZ)
    jours = pd.Series(1, index=w.index).groupby(w.index.date).sum()
    complets = [d for d, n in jours.items() if n == 48]   # jours locaux complets seulement
    return w[np.isin(w.index.date, complets)], len(complets)


def main():
    data = sys.argv[1]
    ch = charger(data)
    regions = sys.argv[2:] or [r for r, n in ch.groupby("reg").station.nunique().sort_values(ascending=False).items() if r]
    print(f"Historique : {ch.t.min():%Y-%m-%d} → {ch.t.max():%Y-%m-%d} (UTC)")
    print(f"{'région':32}{'stations':>9}{'jours':>6}  {'amplitude':>9}  {'creux':>6}  {'sommet':>6}  soir < matin   hausses nocturnes")
    for reg in regions:
        w, nj = grille(ch, reg)
        if w.shape[1] < 20 or nj < 3: continue
        med = w.median(axis=1)
        ecart = med - med.groupby(med.index.date).transform("mean")
        prof = ecart.groupby(ecart.index.hour).mean()
        amp = np.mean([g.max() - g.min() for _, g in med.groupby(med.index.date)])
        ok = sum(1 for _, g in med.groupby(med.index.date)
                 if g[g.index.hour.isin(SOIR)].mean() < g[g.index.hour.isin(MATIN)].mean() - 1)
        # Nuits où au moins 30 % des stations montent de 4 ¢ ou plus entre 22 h et 3 h.
        up = (w.diff() >= 4).sum(axis=1) / w.shape[1]
        nuit = up[up.index.hour.isin([22, 23, 0, 1, 2])]
        nuits = (nuit.groupby((nuit.index - pd.Timedelta("12h")).date).sum() >= 0.30)
        print(f"{reg:32}{w.shape[1]:>9}{nj:>6}  {amp:>7.1f} ¢  {prof.idxmin():>4} h  {prof.idxmax():>4} h  {ok:>3}/{nj:<3} jours  {int(nuits.sum())}/{len(nuits)} nuits")
        if len(regions) <= 3:
            print("   profil (écart à la moyenne du jour, médiane) : " + " ".join(f"{h:02d}h{v:+.1f}" for h, v in prof.items()))


if __name__ == "__main__":
    main()
