"""Copy the local snapshot (data/snapshot) into MongoDB, once.

A new Atlas database then starts with the full history (10 years of daily
prices, 4 years of imports) instead of waiting for the first long collector run.
Safe to run again: like the collector, it only writes values that are new or changed.

    set MONGODB_URI=mongodb+srv://...          (PowerShell: $env:MONGODB_URI="...")
    python -m collector.seed_mongo
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from collector.store import JsonStore, MongoStore  # noqa: E402


def main() -> int:
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        print("Set MONGODB_URI first.")
        return 1
    src = JsonStore(ROOT / "data" / "snapshot")
    dst = MongoStore(uri, os.environ.get("MONGODB_DB", "chempulse"))

    files = sorted((ROOT / "data" / "snapshot" / "points").glob("*.json"))
    for f in files:
        sid = f.stem
        pts = sorted(src.get_points(sid).values(), key=lambda p: p["d"])
        r = dst.save_points(sid, pts)
        print(f"{sid:<26} {len(pts):>5} points  new {r['new']:>5}  changed {r['updated']:>4}")

    for key, value in src.meta.get("state", {}).items():
        dst.set_state(key, value)

    import json

    origins_path = ROOT / "data" / "snapshot" / "origins.json"
    if origins_path.exists():
        n = 0
        for chem, months in json.loads(origins_path.read_text(encoding="utf-8")).items():
            for month, rows in months.items():
                n += dst.save_origins(chem, month, rows)
        print(f"origins: {n} chemical-months written")

    news_path = ROOT / "data" / "snapshot" / "news.json"
    if news_path.exists():
        added = dst.save_news(json.loads(news_path.read_text(encoding="utf-8")))
        print(f"news: {added} headlines added")

    for entry in reversed(src.meta.get("runs", [])):
        dst.log_run(dict(entry))
    dst.close()
    print("Done. Point the website at the same MONGODB_URI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
