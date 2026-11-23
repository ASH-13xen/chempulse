"""Re-apply the product matching rules (config/products.json) to stored marketplace listings.

Run after editing products.json:

    python -m collector.recheck            # report only
    python -m collector.recheck --apply    # delete listings that no longer match, fix flags

A listing whose title no longer matches its product (for example "Ortho Xylene"
after xylene was told to exclude ortho-xylene) is removed together with its price
history. Brief rows are left alone. Prices quoted in US dollars are flagged and
dropped from the Rs/kg figures.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from collector.sources.marketplaces import make_matcher  # noqa: E402

FOREIGN = re.compile(r"usd|us\$|\$|eur|€", re.I)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    uri = os.environ.get("MONGODB_URI", "")
    if not uri:
        print("Set MONGODB_URI first.")
        return 1
    from pymongo import MongoClient

    db = MongoClient(uri)[os.environ.get("MONGODB_DB", "chempulse")]
    products = {p["id"]: p for p in json.loads((ROOT / "config" / "products.json").read_text(encoding="utf-8"))["products"]}
    matchers = {pid: make_matcher(p) for pid, p in products.items()}
    remove, usd = [], []
    for d in db.listings.find({"src": {"$in": ["indiamart", "tradeindia", "exportersindia"]}}, {"title": 1, "product": 1, "priceText": 1, "flags": 1}):
        m = matchers.get(d.get("product"))
        if m is None or not m(d.get("title", "")):
            remove.append((d["_id"], d.get("product"), d.get("title", "")))
        elif FOREIGN.search(d.get("priceText") or "") and "foreign-currency" not in (d.get("flags") or []):
            usd.append(d["_id"])
    print(f"{len(remove)} listings no longer match their product; {len(usd)} quoted in a foreign currency")
    for _id, prod, title in remove[:40]:
        print(f"  - {prod}: {title[:80]}")
    if args.apply:
        ids = [r[0] for r in remove]
        if ids:
            db.listings.delete_many({"_id": {"$in": ids}})
            db.listing_prices.delete_many({"l": {"$in": ids}})
        if usd:
            db.listings.update_many({"_id": {"$in": usd}}, {"$set": {"priceKg": None}, "$addToSet": {"flags": "foreign-currency"}})
        print("applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
