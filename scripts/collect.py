#!/usr/bin/env python3
"""Historique des prix de l'essence au Québec.

Lit le fichier public de la Régie de l'énergie et n'enregistre que les changements :
  data/changes/AAAA-MM.csv   horodatage UTC, station, carburant (R/S/D), prix en ¢/L ("" = plus disponible)
  data/state.jsonl           dernier prix connu de chaque station (une station par ligne)
  data/summary/regions.json  par jour (heure du Québec), région et carburant : min, q1, médiane, q3, max, nombre
  data/meta.json             dernier passage, pour le suivi

Le premier passage enregistre toutes les stations : avec les changements suivants,
on peut reconstituer le prix de n'importe quelle station à n'importe quel moment.

Usage : python3 collect.py DOSSIER_DATA [fichier_local.geojson(.gz)]
Aucune dépendance : Python 3.9+.
"""
import csv
import gzip
import hashlib
import json
import os
import re
import statistics
import sys
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

FEED = "https://regieessencequebec.ca/stations.geojson.gz"
FUELS = {"Régulier": 0, "Super": 1, "Diesel": 2}
CODES = "RSD"
TZ = ZoneInfo("America/Toronto")
KEEP_DAYS = 400
SERIES_DAYS = 35


def fetch(local=None):
    if local:
        with open(local, "rb") as fh:
            raw = fh.read()
    else:
        req = urllib.request.Request(FEED, headers={
            "User-Agent": "essence-historique/1.0 (projet personnel, github.com/SamS-777/Qc-Gas-Test)",
            "Accept-Encoding": "gzip",
        })
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)


def parse_price(v):
    m = re.search(r"\d+(?:[.,]\d+)?", str(v or ""))
    if not m:
        return None
    x = float(m.group(0).replace(",", "."))
    return round(x, 1) if 50 < x < 500 else None


def station_key(name, address):
    # La Régie ne fournit pas d'identifiant : nom + adresse sont uniques dans ses données.
    return hashlib.sha1(f"{name.strip().lower()}|{address.strip().lower()}".encode()).hexdigest()[:10]


def read_feed(doc):
    out, dups = {}, 0
    for f in doc.get("features", []):
        p = f.get("properties") or {}
        name, addr = (p.get("Name") or "").strip(), (p.get("Address") or "").strip()
        if not name and not addr:
            continue
        try:
            lon, lat = f["geometry"]["coordinates"][:2]
        except (KeyError, TypeError, ValueError):
            lon = lat = None
        prices = [None, None, None]
        if (p.get("Status") or "").strip() in ("", "En opération"):
            for e in p.get("Prices") or []:
                i = FUELS.get(e.get("GasType"))
                if i is not None and e.get("IsAvailable", True):
                    prices[i] = parse_price(e.get("Price"))
        brand = (p.get("brand") or "").strip()
        key = station_key(name, addr)
        if key in out:
            dups += 1  # même nom + adresse (ou collision) : le dernier l'emporte, on le signale
        out[key] = {
            "n": name, "b": "" if brand == "Aucun" else brand, "a": addr,
            "r": (p.get("Region") or "").strip(),
            "y": round(lat, 5) if lat else None, "x": round(lon, 5) if lon else None,
            "p": prices,
        }
    if dups:
        print(f"Attention : {dups} station(s) en double (même nom et adresse) fusionnée(s).")
    return out


def load_state(path):
    st = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    row = json.loads(line)
                    st[row.pop("k")] = row
    return st


def save_state(path, st):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for k in sorted(st):
            fh.write(json.dumps({"k": k, **st[k]}, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, path)


def quartiles(vals):
    vals = sorted(vals)
    if len(vals) == 1:
        return vals[0], vals[0], vals[0]
    q = statistics.quantiles(vals, n=4, method="inclusive")
    return q[0], q[1], q[2]


def region_stats(cur):
    by = {}
    for s in cur.values():
        for i, v in enumerate(s["p"]):
            if v is not None and s["r"]:
                by.setdefault(s["r"], {}).setdefault(CODES[i], []).append(v)
                by.setdefault("Québec", {}).setdefault(CODES[i], []).append(v)
    out = {}
    for region, fuels in by.items():
        out[region] = {}
        for code, vals in fuels.items():
            q1, med, q3 = quartiles(vals)
            out[region][code] = [min(vals), round(q1, 1), round(med, 1), round(q3, 1), max(vals), len(vals)]
    return out


ISO_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")
FUTURE_TOLERANCE_MIN = 10


def parse_time(s):
    """Horodatage ISO strict → UTC. Accepte Z, un décalage valide ou rien (= UTC) et toute longueur de fraction
    (ramenée à 6 chiffres). Toute autre forme est refusée (ValueError) : on n'enregistre rien plutôt que de deviner."""
    m = ISO_RE.match(str(s).strip())
    if not m:
        raise ValueError(f"horodatage invalide : {s!r}")
    base, frac, tz = m.groups()
    tz = "+00:00" if tz in (None, "Z") else tz
    d = datetime.fromisoformat(base + (frac[:7].ljust(7, "0") if frac else "") + tz)  # décalage impossible → ValueError
    return d.astimezone(timezone.utc)


def epoch_min(stamp):
    return int(datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() // 60)


def p10(v):
    # Prix en dixièmes de cent (1719 = 171,9 ¢) ; 0 = pas de prix.
    return int(round(float(v) * 10)) if v not in ("", None) else 0


def update_series(data_dir, rows, when):
    """Fichiers compacts lus par l'appli : data/series/{R,S,D}.json.

    Pour chaque station, les paliers de prix des SERIES_DAYS derniers jours :
      {"t0": minutes depuis 1970 (UTC), "debut": premier point, "maj": ..., "s": {station: [t, prix, t, prix, ...]}}
    t = minutes après t0 ; prix en dixièmes de cent, 0 = pas de prix. Le premier point de chaque station
    donne son prix au début de la fenêtre. Mis à jour à chaque passage (ou reconstruit depuis data/changes)."""
    sdir = os.path.join(data_dir, "series")
    os.makedirs(sdir, exist_ok=True)
    now = epoch_min(when.strftime("%Y-%m-%dT%H:%M:%SZ"))
    start = now - SERIES_DAYS * 1440
    series = {c: {} for c in CODES}
    debut = {}
    paths = {c: os.path.join(sdir, c + ".json") for c in CODES}
    if all(os.path.exists(p) for p in paths.values()):
        for c, p in paths.items():
            doc = json.load(open(p, encoding="utf-8"))
            t0, debut[c] = doc["t0"], doc.get("debut")
            series[c] = {k: [[t0 + v[i], v[i + 1]] for i in range(0, len(v), 2)] for k, v in doc["s"].items()}
        feed = rows
    else:  # première fois : on reconstruit à partir de tous les changements enregistrés
        feed = []
        cdir = os.path.join(data_dir, "changes")
        for name in sorted(os.listdir(cdir)):
            with open(os.path.join(cdir, name), encoding="utf-8") as fh:
                feed += [r for r in csv.reader(fh) if r and r[0] != "t"]
        feed.sort(key=lambda r: r[0])
    for t, k, c, v in feed:
        tm, val = epoch_min(t), p10(v)
        pts = series[c].setdefault(k, [])
        if pts and pts[-1][1] == val:
            continue
        if pts and pts[-1][0] == tm:
            pts[-1][1] = val
        else:
            pts.append([tm, val])
        if not debut.get(c):
            debut[c] = tm
    stamp = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    for c in CODES:
        out, t0 = {}, max(start, debut.get(c) or start)
        for k, pts in series[c].items():
            # On garde le dernier palier d'avant la fenêtre, ramené au début de la fenêtre.
            i = 0
            while i + 1 < len(pts) and pts[i + 1][0] <= t0:
                i += 1
            pts = [[max(pts[i][0], t0), pts[i][1]]] + pts[i + 1:]
            if any(p[1] for p in pts):
                out[k] = [x for p in pts for x in (p[0] - t0, p[1])]
        doc = {"t0": t0, "debut": debut.get(c), "maj": stamp, "fenetre_jours": SERIES_DAYS, "s": out}
        tmp = paths[c] + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, separators=(",", ":"))
        os.replace(tmp, paths[c])


def main(data_dir, local=None):
    os.makedirs(os.path.join(data_dir, "changes"), exist_ok=True)
    os.makedirs(os.path.join(data_dir, "summary"), exist_ok=True)
    meta_path = os.path.join(data_dir, "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}

    doc = fetch(local)
    gen = (doc.get("metadata") or {}).get("generated_at")
    now = datetime.now(timezone.utc)
    # 1. Le fichier reçu doit avoir une heure valide et non future — vérifié AVANT tout retour anticipé.
    if not gen:
        raise SystemExit("Fichier de la Régie sans heure de production (metadata.generated_at) : refusé, rien n'est enregistré.")
    try:
        when = parse_time(gen)
    except ValueError as e:
        raise SystemExit(f"Fichier de la Régie refusé : {e}. Rien n'est enregistré.")
    if (when - now).total_seconds() > FUTURE_TOLERANCE_MIN * 60:
        raise SystemExit(f"Fichier de la Régie daté dans le futur ({gen}) : refusé, rien n'est enregistré.")
    # 2. L'heure déjà enregistrée sert de borne : elle doit elle-même être valide.
    prev = None
    if meta.get("generated_at"):
        try:
            prev = parse_time(meta["generated_at"])
        except ValueError:
            prev = None
        if prev is None or (prev - now).total_seconds() > FUTURE_TOLERANCE_MIN * 60:
            raise SystemExit(f"{meta_path} contient une heure invalide ou future ({meta['generated_at']!r}). "
                             "Réparation : remplacer generated_at par l'heure du dernier passage valide (ou supprimer la clé), puis relancer.")
    # 3. Seulement maintenant : fichier inchangé ?
    if gen == meta.get("generated_at"):
        print(f"Fichier de la Régie inchangé ({gen}) : rien à enregistrer.")
        return 0
    if prev and when < prev:
        print(f"Fichier de la Régie plus ancien que le dernier enregistré ({gen} < {meta['generated_at']}) : ignoré.")
        return 0
    stamp = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    cur = read_feed(doc)
    if len(cur) < 500:
        raise SystemExit(f"Seulement {len(cur)} stations lues : fichier suspect, on n'enregistre rien.")

    state_path = os.path.join(data_dir, "state.jsonl")
    old = load_state(state_path)
    rows = []
    for k, s in cur.items():
        before = old.get(k, {}).get("p", [None, None, None])
        for i in range(3):
            if k not in old and s["p"][i] is None:
                continue
            if s["p"][i] != before[i]:
                rows.append([stamp, k, CODES[i], "" if s["p"][i] is None else f"{s['p'][i]:.1f}"])
    for k, s in old.items():  # stations disparues du fichier
        if k not in cur:
            rows += [[stamp, k, CODES[i], ""] for i in range(3) if s["p"][i] is not None]

    month_path = os.path.join(data_dir, "changes", when.strftime("%Y-%m") + ".csv")
    new_file = not os.path.exists(month_path)
    with open(month_path, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new_file:
            w.writerow(["t", "station", "carburant", "prix"])
        w.writerows(rows)

    # Les stations disparues restent dans l'état (sans prix) pour garder leur nom et leur adresse.
    merged = dict(old)
    for k in old:
        if k not in cur:
            merged[k] = {**old[k], "p": [None, None, None]}
    merged.update(cur)
    save_state(state_path, merged)

    # Statistiques du jour (heure du Québec) : le dernier passage de la journée l'emporte.
    reg_path = os.path.join(data_dir, "summary", "regions.json")
    reg = json.load(open(reg_path, encoding="utf-8")) if os.path.exists(reg_path) else {"cols": ["min", "q1", "mediane", "q3", "max", "n"], "jours": {}}
    day = when.astimezone(TZ).strftime("%Y-%m-%d")
    reg["jours"][day] = region_stats(cur)
    reg["jours"] = dict(sorted(reg["jours"].items())[-KEEP_DAYS:])
    reg["maj"] = stamp
    with open(reg_path, "w", encoding="utf-8") as fh:
        json.dump(reg, fh, ensure_ascii=False, separators=(",", ":"))

    update_series(data_dir, rows, when)

    meta.update({"generated_at": gen, "dernier_passage": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "stations": len(cur), "changements_ce_passage": len(rows),
                 "premier_passage": meta.get("premier_passage", stamp)})
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
    print(f"{stamp} : {len(cur)} stations, {len(rows)} changement(s) enregistré(s).")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
