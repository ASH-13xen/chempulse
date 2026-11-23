"""Where collected data is saved.

Two interchangeable stores:
  * MongoStore - MongoDB Atlas (production). Used when MONGODB_URI is set.
  * JsonStore  - JSON files in data/snapshot (local preview / no database).

Both follow the same rule: a price is written only when it is new or has
changed. If a source returns the same numbers as last time, nothing is written.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
import re
from pathlib import Path

# Fields a price point can carry.
#   v   main value (close price, spot value, or import price in Rs/kg)
#   o/h/l  open / high / low (futures only)
#   vol, oi  traded volume and open interest (futures only)
#   q   import quantity in kg (imports only)
#   val import value in Rs crore (imports only)
FIELDS = ("v", "o", "h", "l", "vol", "oi", "q", "val")


def _same(a, b) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9)


def point_changed(old: dict, new: dict) -> bool:
    return any(not _same(old.get(k), new.get(k)) for k in FIELDS if k in new)


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


_LEGAL = re.compile(r"\b(m/s|messrs|pvt|private|ltd|limited|llp|opc|co|company|corp|corporation|inc|the)\b\.?", re.I)


def company_key(name: str) -> str:
    n = _LEGAL.sub(" ", (name or "").lower().replace("&", " and "))
    n = re.sub(r"[^a-z0-9]+", "-", n).strip("-")
    return n[:80] or "unknown"


LISTING_FIELDS = ("title", "company", "city", "state", "price", "unit", "priceKg", "priceText", "pack", "grade", "flags",
                  "memberYears", "gstVerified", "rating", "ratings", "types", "url")


def listing_doc(src: str, product: dict, row: dict, page_city) -> dict:
    doc = {k: row.get(k) for k in LISTING_FIELDS}
    doc.update(src=src, product=product["id"], chem=product.get("chem"), category=product.get("category"),
               companyKey=company_key(row.get("company", "")), pageCity=page_city)
    return doc


def listing_id(src: str, product_id: str, row: dict) -> str:
    return f"{src}:{product_id}:{row['id']}"


def price_changed(old: dict, new: dict) -> bool:
    return not (_same(old.get("price"), new.get("price")) and _same(old.get("priceKg"), new.get("priceKg"))
                and old.get("unit") == new.get("unit"))


class BaseStore:
    def diff(self, series_id: str, points: list[dict]) -> tuple[list[dict], int, int, int]:
        """Split incoming points into the ones that need writing.

        Returns (to_write, new_count, updated_count, unchanged_count).
        """
        if not points:
            return [], 0, 0, 0
        since = min(p["d"] for p in points)
        existing = self.get_points(series_id, since)
        to_write, new, upd, same = [], 0, 0, 0
        for p in points:
            old = existing.get(p["d"])
            if old is None:
                new += 1
                to_write.append(p)
            elif point_changed(old, p):
                upd += 1
                to_write.append(p)
            else:
                same += 1
        return to_write, new, upd, same

    def save_points(self, series_id: str, points: list[dict]) -> dict:
        to_write, new, upd, same = self.diff(series_id, points)
        if to_write:
            self._write_points(series_id, to_write)
            self._touch_series(series_id)
        return {"new": new, "updated": upd, "unchanged": same}

    # implemented by subclasses
    def get_points(self, series_id: str, since: str | None = None) -> dict[str, dict]: ...
    def last_date(self, series_id: str) -> str | None: ...
    def _write_points(self, series_id: str, points: list[dict]) -> None: ...
    def _touch_series(self, series_id: str) -> None: ...
    def get_state(self, key: str, default=None): ...
    def set_state(self, key: str, value) -> None: ...
    def save_origins(self, chem_id: str, month: str, rows: list[dict]) -> bool: ...
    def save_news(self, items: list[dict]) -> int: ...
    def log_run(self, entry: dict) -> None: ...
    def close(self) -> None: ...


# --------------------------------------------------------------------------- JSON


class JsonStore(BaseStore):
    """Stores everything as JSON under data/snapshot. Good for local previews."""

    def __init__(self, root: Path):
        self.root = root
        (root / "points").mkdir(parents=True, exist_ok=True)
        self.meta_path = root / "meta.json"
        self.meta = self._load(self.meta_path, {"series": {}, "runs": [], "state": {}})
        self._cache: dict[str, dict[str, dict]] = {}

    @staticmethod
    def _load(path: Path, default):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return default

    @staticmethod
    def _dump(path: Path, data) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(path)

    def _series_file(self, series_id: str) -> Path:
        return self.root / "points" / f"{series_id}.json"

    def _all(self, series_id: str) -> dict[str, dict]:
        if series_id not in self._cache:
            raw = self._load(self._series_file(series_id), None)
            rows: dict[str, dict] = {}
            if raw:
                cols = raw["cols"]
                for r in raw["rows"]:
                    doc = {c: r[i] for i, c in enumerate(cols) if r[i] is not None}
                    doc.setdefault("v", None)
                    rows[doc["d"]] = doc
            self._cache[series_id] = rows
        return self._cache[series_id]

    def get_points(self, series_id, since=None):
        allp = self._all(series_id)
        if since is None:
            return dict(allp)
        return {d: p for d, p in allp.items() if d >= since}

    def last_date(self, series_id):
        allp = self._all(series_id)
        return max(allp) if allp else None

    def _write_points(self, series_id, points):
        allp = self._all(series_id)
        for p in points:
            allp[p["d"]] = {**allp.get(p["d"], {}), **p}
        present = [f for f in FIELDS if any(f in p for p in allp.values())]
        cols = ["d", *present]
        rows = [[allp[d].get(c) for c in cols] for d in sorted(allp)]
        self._dump(self._series_file(series_id), {"cols": cols, "rows": rows})

    def _touch_series(self, series_id):
        allp = self._all(series_id)
        dates = sorted(allp)
        self.meta["series"][series_id] = {
            "firstDate": dates[0] if dates else None,
            "lastDate": dates[-1] if dates else None,
            "count": len(dates),
            "changedAt": now_utc().isoformat(),
        }
        self._dump(self.meta_path, self.meta)

    def get_state(self, key, default=None):
        return self.meta["state"].get(key, default)

    def set_state(self, key, value):
        self.meta["state"][key] = value
        self._dump(self.meta_path, self.meta)

    def save_origins(self, chem_id, month, rows):
        path = self.root / "origins.json"
        data = self._load(path, {})
        current = data.get(chem_id, {}).get(month)
        if current == rows:
            return False
        data.setdefault(chem_id, {})[month] = rows
        self._dump(path, data)
        return True

    def save_news(self, items):
        path = self.root / "news.json"
        data = self._load(path, [])
        seen = {n["id"] for n in data}
        added = [n for n in items if n["id"] not in seen]
        if not added:
            return 0
        cutoff = (now_utc() - dt.timedelta(days=60)).isoformat()
        data = [n for n in data + added if n["published"] >= cutoff]
        data.sort(key=lambda n: n["published"], reverse=True)
        self._dump(path, data)
        return len(added)

    def log_run(self, entry):
        self.meta["runs"] = ([entry] + self.meta["runs"])[:200]
        self._dump(self.meta_path, self.meta)

    # --- sellers (kept in memory, written on close) ---
    def _sellers(self):
        if not hasattr(self, "_sel"):
            d = self.root / "sellers"
            d.mkdir(exist_ok=True)
            self._sel = {
                "listings": self._load(d / "listings.json", {}),
                "prices": self._load(d / "listing_prices.json", []),
                "crawl": self._load(d / "crawl.json", {}),
            }
            self._sel_dirty = False
        return self._sel

    def get_crawl(self, src):
        return {k: v for k, v in self._sellers()["crawl"].items() if k.startswith(src + ":")}

    def set_crawl(self, src, key, meta):
        self._sellers()["crawl"][key] = meta
        self._sel_dirty = True

    def save_listings(self, src, product, rows, page_key=None, page_city=None):
        sel = self._sellers()
        stats = {"new": 0, "updated": 0, "unchanged": 0}
        now = now_utc().isoformat()
        week_ago = (now_utc() - dt.timedelta(days=7)).isoformat()
        for row in rows:
            lid = listing_id(src, product["id"], row)
            doc = listing_doc(src, product, row, page_city)
            old = sel["listings"].get(lid)
            hist = {"l": lid, "d": now[:10], "price": doc["price"], "unit": doc["unit"], "priceKg": doc["priceKg"], "product": product["id"]}
            if old is None:
                sel["listings"][lid] = {**doc, "firstSeen": now, "lastSeen": now, "changedAt": now}
                sel["prices"].append(hist)
                stats["new"] += 1
            elif price_changed(old, doc):
                sel["listings"][lid] = {**old, **doc, "lastSeen": now, "changedAt": now}
                sel["prices"].append(hist)
                stats["updated"] += 1
            else:
                if old.get("lastSeen", "") < week_ago:
                    old["lastSeen"] = now
                stats["unchanged"] += 1
        self._sel_dirty = True
        return stats

    def save_brief(self, brief):
        path = self.root / "briefs.json"
        data = [b for b in self._load(path, []) if b["id"] != brief["id"]] + [brief]
        self._dump(path, data)

    def close(self):
        if getattr(self, "_sel_dirty", False):
            d = self.root / "sellers"
            self._dump(d / "listings.json", self._sel["listings"])
            self._dump(d / "listing_prices.json", self._sel["prices"])
            self._dump(d / "crawl.json", self._sel["crawl"])


# --------------------------------------------------------------------------- Mongo


class MongoStore(BaseStore):
    """Stores data in MongoDB Atlas.

    Collections:
      points   one document per series per date  {s, t, v, o, h, l, vol, oi, q, val}
      series   last date / change time per series
      origins  import origin countries per chemical per month
      news     headlines per chemical
      runs     a log line per source per collector run (shown on the Data page)
      state    small bookkeeping values (e.g. latest Tradestat month)
      quotes   prices the client types in on the website
    """

    def __init__(self, uri: str, db_name: str):
        from pymongo import ASCENDING, DESCENDING, MongoClient

        self.client = MongoClient(uri, serverSelectionTimeoutMS=20000, appname="chempulse-collector")
        self.db = self.client[db_name]
        self.db.points.create_index([("s", ASCENDING), ("t", ASCENDING)], unique=True)
        self.db.news.create_index([("published", DESCENDING)])
        self.db.news.create_index([("chem", ASCENDING), ("published", DESCENDING)])
        self.db.runs.create_index([("at", DESCENDING)])
        self.db.quotes.create_index([("chem", ASCENDING), ("date", DESCENDING)])
        self.db.listings.create_index([("product", ASCENDING)])
        self.db.listings.create_index([("companyKey", ASCENDING)])
        self.db.listing_prices.create_index([("l", ASCENDING), ("d", ASCENDING)])
        self.db.crawl.create_index([("src", ASCENDING)])

    @staticmethod
    def _t(d: str) -> dt.datetime:
        return dt.datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)

    def get_points(self, series_id, since=None):
        q: dict = {"s": series_id}
        if since:
            q["t"] = {"$gte": self._t(since)}
        out = {}
        for doc in self.db.points.find(q, {"_id": 0, "s": 0}):
            d = doc.pop("t").strftime("%Y-%m-%d")
            doc["d"] = d
            out[d] = doc
        return out

    def last_date(self, series_id):
        meta = self.db.series.find_one({"_id": series_id})
        return meta.get("lastDate") if meta else None

    def _write_points(self, series_id, points):
        from pymongo import UpdateOne

        ops = []
        for p in points:
            fields = {k: p[k] for k in FIELDS if k in p}
            ops.append(UpdateOne({"s": series_id, "t": self._t(p["d"])}, {"$set": fields}, upsert=True))
        for i in range(0, len(ops), 1000):
            self.db.points.bulk_write(ops[i : i + 1000], ordered=False)

    def _touch_series(self, series_id):
        first = self.db.points.find_one({"s": series_id}, sort=[("t", 1)])
        last = self.db.points.find_one({"s": series_id}, sort=[("t", -1)])
        self.db.series.update_one(
            {"_id": series_id},
            {
                "$set": {
                    "firstDate": first["t"].strftime("%Y-%m-%d") if first else None,
                    "lastDate": last["t"].strftime("%Y-%m-%d") if last else None,
                    "count": self.db.points.count_documents({"s": series_id}),
                    "changedAt": now_utc(),
                }
            },
            upsert=True,
        )

    def get_state(self, key, default=None):
        doc = self.db.state.find_one({"_id": key})
        return doc["value"] if doc else default

    def set_state(self, key, value):
        self.db.state.update_one({"_id": key}, {"$set": {"value": value}}, upsert=True)

    def save_origins(self, chem_id, month, rows):
        _id = f"{chem_id}:{month}"
        current = self.db.origins.find_one({"_id": _id})
        if current and current.get("rows") == rows:
            return False
        self.db.origins.update_one(
            {"_id": _id},
            {"$set": {"chem": chem_id, "month": month, "rows": rows, "updatedAt": now_utc()}},
            upsert=True,
        )
        return True

    def save_news(self, items):
        from pymongo import UpdateOne

        if not items:
            return 0
        ops = []
        for n in items:
            doc = {**n, "published": dt.datetime.fromisoformat(n["published"])}
            _id = doc.pop("id")
            ops.append(UpdateOne({"_id": _id}, {"$setOnInsert": doc}, upsert=True))
        res = self.db.news.bulk_write(ops, ordered=False)
        self.db.news.delete_many({"published": {"$lt": now_utc() - dt.timedelta(days=60)}})
        return res.upserted_count

    def get_crawl(self, src):
        out = {}
        for d in self.db.crawl.find({"src": src}):
            k = d.pop("_id")
            if isinstance(d.get("fetchedAt"), dt.datetime):
                d["fetchedAt"] = d["fetchedAt"].replace(tzinfo=dt.timezone.utc).isoformat()
            out[k] = d
        return out

    def set_crawl(self, src, key, meta):
        self.db.crawl.update_one({"_id": key}, {"$set": {**meta, "src": src}}, upsert=True)

    def save_listings(self, src, product, rows, page_key=None, page_city=None):
        from pymongo import InsertOne, UpdateOne

        stats = {"new": 0, "updated": 0, "unchanged": 0}
        if not rows:
            return stats
        now = now_utc()
        week_ago = now - dt.timedelta(days=7)
        ids = [listing_id(src, product["id"], r) for r in rows]
        existing = {d["_id"]: d for d in self.db.listings.find({"_id": {"$in": ids}})}
        ops, hist = [], []
        for lid, row in zip(ids, rows):
            doc = listing_doc(src, product, row, page_city)
            old = existing.get(lid)
            h = {"l": lid, "d": now.strftime("%Y-%m-%d"), "price": doc["price"], "unit": doc["unit"], "priceKg": doc["priceKg"], "product": product["id"]}
            if old is None:
                ops.append(UpdateOne({"_id": lid}, {"$set": {**doc, "lastSeen": now, "changedAt": now}, "$setOnInsert": {"firstSeen": now}}, upsert=True))
                hist.append(InsertOne(h))
                existing[lid] = dict(doc)
                stats["new"] += 1
            elif price_changed(old, doc):
                ops.append(UpdateOne({"_id": lid}, {"$set": {**doc, "lastSeen": now, "changedAt": now}}))
                hist.append(InsertOne(h))
                stats["updated"] += 1
            else:
                last = old.get("lastSeen")
                if last is None or last.replace(tzinfo=dt.timezone.utc) < week_ago:
                    ops.append(UpdateOne({"_id": lid}, {"$set": {"lastSeen": now}}))
                stats["unchanged"] += 1
        if ops:
            self.db.listings.bulk_write(ops, ordered=False)
        if hist:
            self.db.listing_prices.bulk_write(hist, ordered=False)
        return stats

    def save_brief(self, brief):
        self.db.briefs.update_one({"_id": brief["id"]}, {"$set": {k: v for k, v in brief.items() if k != "id"}}, upsert=True)

    def log_run(self, entry):
        self.db.runs.insert_one({**entry, "at": dt.datetime.fromisoformat(entry["at"])})
        # keep the log small
        old = list(self.db.runs.find({}, {"_id": 1}).sort("at", -1).skip(500))
        if old:
            self.db.runs.delete_many({"_id": {"$in": [d["_id"] for d in old]}})

    def close(self):
        self.client.close()


def news_id(link: str) -> str:
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:20]


def open_store(sink: str | None, root: Path) -> BaseStore:
    uri = os.environ.get("MONGODB_URI", "").strip()
    sink = sink or ("mongo" if uri else "json")
    if sink == "mongo":
        if not uri:
            raise SystemExit("MONGODB_URI is not set. Use --sink json for a local preview.")
        return MongoStore(uri, os.environ.get("MONGODB_DB", "chempulse"))
    return JsonStore(root)
