"""Tests du collecteur d'historique (scripts/collect.py), dont les reproductions des revues de code.

Lancer depuis la racine du dépôt :  python3 -m unittest discover -s tests -p "test_*.py" -v
Aucune dépendance, aucun réseau : les fichiers de la Régie sont synthétiques.
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import collect  # noqa: E402


def feed(gen, n=600, shift=0.0, dup=False, missing_gen=False):
    feats = []
    for i in range(n):
        reg = 165 + (i % 20) + shift
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [-73.6 + i * 1e-4, 45.5]},
                      "properties": {"Name": f"Station {i}", "brand": "Shell" if i % 2 else "Aucun", "Status": "En opération",
                                     "Address": f"{1000 + i} Rue Test, Montréal", "Region": "Montréal",
                                     "Prices": [{"GasType": "Régulier", "Price": f"{reg:.1f}¢", "IsAvailable": True},
                                                {"GasType": "Super", "Price": f"{reg + 20:.1f}¢", "IsAvailable": True}]}})
    if dup:
        feats.append(json.loads(json.dumps(feats[1])))
    meta = {} if missing_gen else {"generated_at": gen}
    return {"type": "FeatureCollection", "metadata": meta, "features": feats}


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + "1234567Z"  # 7 décimales, comme la Régie


class CollectorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = os.path.join(self.tmp.name, "data")
        self.now = datetime.now(timezone.utc).replace(microsecond=0)

    def tearDown(self):
        self.tmp.cleanup()

    def run_feed(self, doc):
        path = os.path.join(self.tmp.name, "feed.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        out = io.StringIO()
        code = 0
        with contextlib.redirect_stdout(out):
            try:
                code = collect.main(self.data, path)
            except SystemExit as e:
                code, out = 1, io.StringIO(str(e))
        return code, out.getvalue()

    def meta(self):
        with open(os.path.join(self.data, "meta.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def series(self, code="R"):
        with open(os.path.join(self.data, "series", code + ".json"), encoding="utf-8") as fh:
            return json.load(fh)

    # --- Fonctionnement normal ---
    def test_premier_passage_puis_changements(self):
        t1 = self.now - timedelta(hours=2)
        self.assertEqual(self.run_feed(feed(iso(t1)))[0], 0)
        self.assertEqual(self.meta()["stations"], 600)
        s = self.series()
        self.assertEqual(len(s["s"]), 600)
        code, out = self.run_feed(feed(iso(t1 + timedelta(minutes=30)), shift=2))
        self.assertEqual(code, 0)
        self.assertIn("1200 changement", out)  # 600 stations × 2 carburants, tous les prix ont bougé
        key = collect.station_key("Station 0", "1000 Rue Test, Montréal")
        pts = self.series()["s"][key]
        self.assertEqual([pts[1], pts[3]], [1650, 1670])  # paliers en dixièmes de cent

    def test_fichier_inchange_ne_reecrit_rien(self):
        t = iso(self.now - timedelta(hours=1))
        self.run_feed(feed(t))
        before = self.meta()
        code, out = self.run_feed(feed(t))
        self.assertEqual((code, self.meta()), (0, before))
        self.assertIn("inchangé", out)

    def test_fichier_plus_ancien_ignore(self):
        self.run_feed(feed(iso(self.now - timedelta(hours=1))))
        code, out = self.run_feed(feed(iso(self.now - timedelta(hours=3)), shift=5))
        self.assertEqual(code, 0)
        self.assertIn("plus ancien", out)

    def test_fichier_incomplet_refuse(self):
        code, out = self.run_feed(feed(iso(self.now), n=100))
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(os.path.join(self.data, "meta.json")))

    def test_doublon_signale(self):
        code, out = self.run_feed(feed(iso(self.now - timedelta(hours=1)), dup=True))
        self.assertEqual(code, 0)
        self.assertIn("en double", out)

    # --- Horodatages (revues 2 et 3) ---
    def test_parse_time_strict(self):
        ok = {"2026-10-13T03:05:01.1489389Z": "2026-10-13T03:05:01.148938+00:00",
              "2026-11-07T14:15:01-05:00": "2026-11-07T19:15:01+00:00",
              "2026-11-07T19:15:01": "2026-11-07T19:15:01+00:00"}
        for raw, want in ok.items():
            self.assertEqual(collect.parse_time(raw).isoformat(), want, raw)
        for bad in ["2026-02-31T12:00:00Z", "2026-11-07T24:00:00Z", "2026-11-07T18:00:00+25:00", "2026-11-07T18:00:00NOT-ISO", "", "hier"]:
            with self.assertRaises(ValueError, msg=bad):
                collect.parse_time(bad)

    def test_heure_absente_refusee(self):
        self.assertEqual(self.run_feed(feed(None, missing_gen=True))[0], 1)

    def test_heure_future_refusee_meme_si_identique(self):
        self.assertEqual(self.run_feed(feed("2099-01-01T00:00:00Z"))[0], 1)
        os.makedirs(self.data, exist_ok=True)
        with open(os.path.join(self.data, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump({"generated_at": "2099-01-01T00:00:00Z"}, fh)
        code, out = self.run_feed(feed("2099-01-01T00:00:00Z"))  # même valeur : plus de faux « inchangé »
        self.assertEqual(code, 1)

    def test_meta_empoisonne_refuse_avec_reparation(self):
        os.makedirs(self.data, exist_ok=True)
        for bad in ["2099-01-01T00:00:00Z", "n'importe quoi"]:
            with open(os.path.join(self.data, "meta.json"), "w", encoding="utf-8") as fh:
                json.dump({"generated_at": bad}, fh)
            code, out = self.run_feed(feed(iso(self.now - timedelta(minutes=5))))
            self.assertEqual(code, 1, bad)
            self.assertIn("Réparation", out)

    # --- Séries lues par l'appli ---
    def test_fenetre_glissante_35_jours(self):
        start = self.now - timedelta(days=40)
        self.run_feed(feed(iso(start)))
        self.run_feed(feed(iso(start + timedelta(days=1)), shift=1))
        self.run_feed(feed(iso(self.now - timedelta(minutes=5)), shift=2))
        s = self.series()
        t0 = s["t0"]
        self.assertGreaterEqual(t0 * 60, (self.now - timedelta(days=35, minutes=10)).timestamp())
        key = collect.station_key("Station 0", "1000 Rue Test, Montréal")
        pts = s["s"][key]
        self.assertEqual(pts[0], 0)        # premier point ramené au début de la fenêtre…
        self.assertEqual(pts[1], 1660)     # …avec le prix en vigueur à ce moment
        self.assertEqual(pts[-1], 1670)

    def test_identifiant_identique_a_l_appli(self):
        # Même vecteur que tests/app.spec.mjs (sha1hex dans le navigateur).
        self.assertEqual(collect.station_key("Station Test Énergie", "1234 Rue Saint-Denis, Montréal"), "48a09cc44d")


if __name__ == "__main__":
    unittest.main()
