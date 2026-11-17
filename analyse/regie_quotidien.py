#!/usr/bin/env python3
"""Peut-on prévoir le prix du lendemain avec les moyennes quotidiennes de la Régie ? (test sur le passé)

Données (site de la Régie de l'énergie, mises à jour une fois par mois) :
  - prix moyen affiché quotidien par région, CSV, depuis 2023 ;
  - IQCA quotidien par région, CSV (la série s'arrête le 2025-06-13) ;
  - prix minimum à la rampe de Montréal, PDF annuel (quotidien en 2026, hebdomadaire avant).

Usage (depuis la racine du dépôt) :
    python3 analyse/regie_quotidien.py telecharger     # vers analyse/donnees/regie/
    python3 analyse/regie_quotidien.py test [Région] [retard du coût en jours ouvrables]

Dépendances : pandas, numpy, et la commande pdftotext (poppler-utils). N'écrit que dans analyse/donnees/.
"""
import csv, glob, os, re, subprocess, sys, urllib.request, warnings
import numpy as np, pandas as pd

warnings.filterwarnings("ignore")
ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "donnees", "regie")
BASE = "https://www.regie-energie.qc.ca/storage/app/media/consommateurs/informations-pratiques/prix-petrole/Tableaux"
CSV_REG = BASE + "/versions-telechargeables/region-administrative/ordinaire"
ANNEES = range(2023, pd.Timestamp.now().year + 1)


def telecharger():
    os.makedirs(DOSSIER, exist_ok=True)
    urls = []
    for a in ANNEES:
        urls += [f"{CSV_REG}/prix-moyen-quotidien/ordinaire_moyen_reg_quot{a}.csv",
                 f"{CSV_REG}/iqca/ordinaire_iqca_regions{a}.csv",
                 f"{BASE}/rampe/rampe{a}.pdf"]
    for u in urls:
        dest = os.path.join(DOSSIER, u.rsplit("/", 1)[-1])
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as fh:
                fh.write(r.read())
            print("ok ", os.path.basename(dest), os.path.getsize(dest))
        except Exception as e:  # un fichier absent (année pas encore publiée) n'arrête pas les autres
            print("ÉCHEC", u, e)


def lire_csv(path):
    """Tableau de la Régie (mis en page pour l'impression) -> {région: {date: valeur}}."""
    rows = list(csv.reader(open(path, encoding="utf-8-sig"), delimiter=";"))
    est_date = lambda c: bool(re.fullmatch(r"\d{4}-\d\d-\d\d", c))
    hdr = next(r for r in rows if sum(map(est_date, r)) > 20)
    cols = [(i, c) for i, c in enumerate(hdr) if est_date(c)]
    out = {}
    for r in rows:
        nom = next((c.strip() for c in r if re.match(r"\s*\d+\.\s", c)), None)
        if not nom: continue
        d = {}
        for i, jour in cols:
            try: d[jour] = float(r[i].strip().replace(",", "."))
            except (ValueError, IndexError): pass
        out[re.sub(r"^\d+\.\s*", "", nom)] = d
    return out


def serie(motif):
    reg = {}
    for p in sorted(glob.glob(os.path.join(DOSSIER, motif))):
        for k, d in lire_csv(p).items(): reg.setdefault(k, {}).update(d)
    df = pd.DataFrame(reg); df.index = pd.to_datetime(df.index)
    return df.sort_index()


def rampe():
    """Prix minimum à la rampe (essence ordinaire, ¢/L hors taxes) lu dans les PDF annuels."""
    out = {}
    for p in sorted(glob.glob(os.path.join(DOSSIER, "rampe20*.pdf"))):
        txt = subprocess.run(["pdftotext", "-layout", p, "-"], capture_output=True, text=True).stdout
        for m in re.finditer(r"(\d{4}-\d\d-\d\d)\s+(\d{2,3},\d{1,2})\s+\d{2,3},\d{1,2}\s+\d{2,3},\d{1,2}", txt):
            out[m.group(1)] = float(m.group(2).replace(",", "."))
    s = pd.Series(out); s.index = pd.to_datetime(s.index)
    return s.sort_index()


def test(region="Montréal", retard=0):
    P, I, R = serie("ordinaire_moyen_reg_quot*.csv"), serie("ordinaire_iqca_regions*.csv"), rampe()
    p, iq = P[region].dropna(), I[region].dropna()
    print(f"=== {region} · prix {p.index[0].date()} → {p.index[-1].date()} · IQCA jusqu'au {iq.index[-1].date()} · rampe jusqu'au {R.index[-1].date()} · retard du coût {retard} j")
    # Coût : IQCA publié ; après son arrêt, reconstruit depuis la rampe quotidienne (relation ajustée sur 2024-2025).
    j = pd.concat([iq, R], axis=1, keys=["iq", "r"], sort=True).dropna(); j = j[j.index.year >= 2024]
    b, a = np.polyfit(j.r, j.iq, 1)
    quot = R[R.index.to_series().diff().dt.days.rolling(5).max() <= 4]      # périodes où la rampe est quotidienne
    cout = iq.reindex(p.index).fillna(a + b * quot.reindex(p.index))
    df = pd.DataFrame({"p": p, "cout": cout.shift(retard)})
    df["d1"], df["d2"] = df.p.diff(), df.p.diff(2)
    df["marge"], df["tend"] = df.p - df.cout, df.cout.diff(3)
    depuis, baisse, sommet, n = [], [], np.nan, 99
    for v, h in zip(df.p, df.d1 >= 3):                                       # position dans le cycle
        if h: n, sommet = 0, v
        else: n += 1
        depuis.append(min(n, 15)); baisse.append((sommet - v) if sommet == sommet else 0)
    df["depuis"], df["baisse"] = depuis, baisse
    for k in range(5): df[f"j{k}"] = (df.index.dayofweek == k).astype(float)
    df["y"] = df.p.shift(-1) - df.p                                          # variation du lendemain
    feats = ["marge", "d1", "d2", "tend", "depuis", "baisse"] + [f"j{k}" for k in range(5)]
    ok = df[feats + ["y"]].notna().all(axis=1)

    def prevoir(feats):
        """Prévision glissante : modèle (régression ridge) réentraîné chaque mois sur le passé seulement."""
        pred = pd.Series(np.nan, index=df.index)
        for mois in sorted(set(df.index[df.index >= "2024-01-01"].to_period("M"))):
            tr = df[ok & (df.index < mois.start_time)]
            te = df[(df.index.to_period("M") == mois) & df[feats].notna().all(axis=1)]
            if len(tr) < 150 or not len(te): continue
            X = tr[feats].values; mu, sd = X.mean(0), X.std(0) + 1e-9
            A = np.c_[(X - mu) / sd, np.ones(len(X))]
            w = np.linalg.solve(A.T @ A + np.eye(A.shape[1]), A.T @ tr.y.values)
            pred[te.index] = np.c_[(te[feats].values - mu) / sd, np.ones(len(te))] @ w
        return pred

    def payer(attendre, H):
        """Chaque jour, quelqu'un doit faire le plein d'ici H jours ouvrables ; prix payé selon la règle."""
        v = df.p.values; out = np.full(len(v), np.nan)
        for t in range(len(v) - H):
            k = 0
            while k < H and attendre(t + k): k += 1
            out[t] = v[t + k]
        return pd.Series(out, index=df.index)

    pred, sans = prevoir(feats), prevoir([f for f in feats if f not in ("marge", "tend")])
    e = (df.y - pred).dropna(); reel = df.y[e.index]
    print(f"Prévision du lendemain : erreur moyenne {e.abs().mean():.2f} ¢ (sans modèle : {reel.abs().mean():.2f} ¢)")
    lignes = []
    for H in (1, 2, 3):
        regles = {
            "signal avec coût": payer(lambda t: pred.values[t] < -0.3, H),
            "signal sans coût": payer(lambda t: sans.values[t] < -0.3, H),
            "toujours attendre": payer(lambda t: True, H),
            "prévision parfaite": pd.Series([np.nanmin(df.p.values[t:t + H + 1]) if t + H < len(df) else np.nan for t in range(len(df))], index=df.index),
        }
        for nom, paye in regles.items():
            gain = (df.p - paye)[pred.notna() & sans.notna()].dropna()
            for an, g in gain.groupby(gain.index.year):
                lignes.append((H, nom, an, g.mean()))
    t = pd.DataFrame(lignes, columns=["jours d'attente max", "règle", "année", "gain"])
    print("Gain moyen en ¢/L par rapport à « faire le plein tout de suite » :")
    print(t.pivot_table(index=["jours d'attente max", "règle"], columns="année", values="gain").round(2).to_string())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "telecharger": telecharger()
    elif len(sys.argv) > 1 and sys.argv[1] == "test": test(*(sys.argv[2:3] or ["Montréal"]), int(sys.argv[3]) if len(sys.argv) > 3 else 0)
    else: print(__doc__)
