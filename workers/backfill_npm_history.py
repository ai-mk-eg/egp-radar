"""
Backfill daily FX history from the open-data package @fawazahmed0/currency-api
(published daily to the npm registry, one version per day since 2024-03-02).

Why npm? It is a reliable, immutable, versioned mirror of the same dataset served
at cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@<date>/v1/currencies/usd.json.
Each version holds that day's rates. We extract only USD-base rates for the
currencies we use as features, then delete the tarball.

Output: data/daily_fx.csv  (date,egp,eur,jpy,gbp,cad,sek,chf,xau,try,zar,brl,inr,ngn,sar)
NOTE: these are daily aggregated reference/mid rates, NOT Egyptian bank quotes.
Usage: python3 -I workers/backfill_npm_history.py [--out data/daily_fx.csv] [--workers 6]
"""
import argparse, csv, io, json, os, sys, tarfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

PKG = "@fawazahmed0/currency-api"
REG = "https://registry.npmjs.org/"
COLS = ["egp", "eur", "jpy", "gbp", "cad", "sek", "chf", "xau", "try", "zar", "brl", "inr", "ngn", "sar"]


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "egp-radar-backfill/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_day(version):
    url = f"{REG}{PKG}/-/currency-api-{version}.tgz"
    for attempt in range(4):
        try:
            blob = get(url)
            with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
                member = tf.getmember("package/v1/currencies/usd.min.json")
                d = json.load(tf.extractfile(member))
            return d["date"], {c: d["usd"].get(c) for c in COLS}
        except Exception as e:  # noqa
            err = e
    print(f"FAILED {version}: {err}", file=sys.stderr)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "daily_fx.csv"))
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    meta = json.loads(get(REG + PKG.replace("/", "%2f")))
    versions = sorted({v for k, v in meta["dist-tags"].items() if k[:2] == "20"})
    have = set()
    if os.path.exists(a.out):
        with open(a.out) as f:
            have = {row["date"] for row in csv.DictReader(f)}
    todo = [v for v in versions if "-".join(f"{int(x):02d}" for x in v.split(".")) not in have]
    print(f"{len(versions)} versions, {len(todo)} to fetch", flush=True)
    rows = []
    with ThreadPoolExecutor(a.workers) as ex:
        for i, res in enumerate(ex.map(fetch_day, todo)):
            if res:
                rows.append(res)
            if i % 50 == 0:
                print(f"{i}/{len(todo)}", flush=True)
    existing = []
    if have:
        with open(a.out) as f:
            existing = list(csv.DictReader(f))
    allrows = {r["date"]: r for r in existing}
    for date, vals in rows:
        allrows[date] = {"date": date, **vals}
    with open(a.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date"] + COLS)
        w.writeheader()
        for k in sorted(allrows):
            w.writerow(allrows[k])
    print(f"wrote {len(allrows)} rows -> {a.out}")


if __name__ == "__main__":
    main()
