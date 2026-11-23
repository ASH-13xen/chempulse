"""ChemPulse data collector.

Run from the project root:

    python -m collector.run                # normal run (what GitHub Actions does every 3 hours)
    python -m collector.run --sink json    # write to data/snapshot instead of MongoDB
    python -m collector.run --only futures fx
    python -m collector.run --force        # ignore the per-source minimum intervals

Each source has a minimum interval, so a 3-hourly schedule does not hammer slow
or monthly sources:
    futures, fred, fx  every run
    news               every 6 hours (chemical headlines + regulatory alerts)
    tradestat          every run, but it only downloads a month once the government publishes it
    indiamart,         every run, each working through a queue of product/city pages
    tradeindia,        within a time budget; a page is re-read at most every ~20 hours
    exportersindia

Prices are written only when new or changed. A run where nothing moved writes
no prices at all, only a line in the run log.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from collector.store import now_utc, open_store  # noqa: E402

HISTORY_START = "2016-01-01"   # how far back a series is loaded the first time
TRADE_START = "2023-01"        # first month of import history
INTERVALS = {"futures": 0, "fred": 0, "fx": 0, "news": 6 * 3600, "tradestat": 0, "indiamart": 0, "tradeindia": 0, "exportersindia": 0}
BUDGET_OVERRIDE: dict[str, float] = {}  # minutes, from --budget


def load_catalog() -> dict:
    return json.loads((ROOT / "config" / "catalog.json").read_text(encoding="utf-8"))


def load_products() -> list[dict]:
    return json.loads((ROOT / "config" / "products.json").read_text(encoding="utf-8"))["products"]


def since_for(store, series_id: str, overlap_days: int = 15) -> str:
    last = store.last_date(series_id)
    if not last:
        return HISTORY_START
    return (dt.date.fromisoformat(last) - dt.timedelta(days=overlap_days)).isoformat()


def add(total: dict, part: dict) -> None:
    for k in ("new", "updated", "unchanged"):
        total[k] = total.get(k, 0) + part.get(k, 0)


def run_futures(store, cat, log):
    from collector.sources import futures

    total, errors = {}, []
    for m in [m for m in cat["markets"] if m["source"] == "futures"]:
        try:
            pts = futures.fetch(m["symbol"], since_for(store, m["id"]))
            r = store.save_points(m["id"], pts)
            add(total, r)
            log(f"  {m['id']:<14} {len(pts):>5} pts  new {r['new']:>4}  changed {r['updated']:>3}")
        except Exception as e:  # keep going: one bad symbol must not stop the rest
            errors.append(f"{m['id']}: {e}")
            log(f"  {m['id']:<14} ERROR {e}")
        time.sleep(0.5)
    if errors and not total:
        raise RuntimeError("; ".join(errors))
    total["errors"] = errors
    return total


def run_fred(store, cat, log):
    from collector.sources import fred

    total, errors = {}, []
    for m in [m for m in cat["markets"] if m["source"] == "fred"]:
        try:
            pts = fred.fetch(m["symbol"], since_for(store, m["id"]))
            r = store.save_points(m["id"], pts)
            add(total, r)
            log(f"  {m['id']:<14} {len(pts):>5} pts  new {r['new']:>4}  changed {r['updated']:>3}  via {fred.last_source}")
        except Exception as e:
            errors.append(f"{m['id']}: {e}")
            log(f"  {m['id']:<14} ERROR {e}")
    if errors and not total:
        raise RuntimeError("; ".join(errors))
    total["errors"] = errors
    return total


def run_fx(store, cat, log):
    from collector.sources import fx

    since = min(since_for(store, "usdinr"), since_for(store, "cnyinr"))
    total = {}
    for sid, pts in fx.fetch(since).items():
        r = store.save_points(sid, pts)
        add(total, r)
        log(f"  {sid:<14} {len(pts):>5} pts  new {r['new']:>4}  changed {r['updated']:>3}")
    return total


def run_tradestat(store, cat, log):
    from collector.sources import tradestat

    return tradestat.collect(store, cat["chemicals"], start=TRADE_START, log=log)


def run_news(store, cat, log):
    from collector.sources import news

    items, errors = [], []
    for ch in cat["chemicals"]:
        try:
            items += news.fetch(ch["id"], ch["news"])
        except Exception as e:
            errors.append(f"{ch['id']}: {e}")
    for c in cat["categories"]:
        try:
            reg = news.fetch_regulatory(c["id"], [ch for ch in cat["chemicals"] if ch["category"] == c["id"]])
            items += reg
        except Exception as e:
            errors.append(f"regulatory {c['id']}: {e}")
    added = store.save_news(items)
    log(f"  {len(items)} headlines read, {added} new")
    if errors and not items:
        raise RuntimeError("; ".join(errors[:3]))
    return {"new": added, "updated": 0, "unchanged": len(items) - added, "errors": errors}


def run_marketplace(src):
    def runner(store, cat, log):
        from collector.sources import marketplaces

        budget = BUDGET_OVERRIDE.get(src)
        stats = marketplaces.crawl(store, load_products(), src, log, budget_s=budget * 60 if budget else None)
        if stats.get("blocked") and not stats.get("pages"):
            raise RuntimeError(f"{src} asked us to slow down; paused for 6 hours")
        return {k: stats.get(k, 0) for k in ("new", "updated", "unchanged")}

    return runner


RUNNERS = {
    "futures": run_futures,
    "fred": run_fred,
    "fx": run_fx,
    "tradestat": run_tradestat,
    "news": run_news,
    "indiamart": run_marketplace("indiamart"),
    "tradeindia": run_marketplace("tradeindia"),
    "exportersindia": run_marketplace("exportersindia"),
}


def ping_site(log) -> None:
    """Tell the website to drop its cache so new prices show immediately."""
    url, secret = os.environ.get("SITE_URL", "").rstrip("/"), os.environ.get("REVALIDATE_SECRET", "")
    if not url or not secret:
        return
    import requests

    try:
        r = requests.post(f"{url}/api/revalidate", headers={"x-revalidate-secret": secret}, timeout=30)
        log(f"site refresh: HTTP {r.status_code}")
    except Exception as e:
        log(f"site refresh failed: {e}")


def load_env_file(path: Path) -> None:
    """For runs on your own PC: read KEY=value lines from .env.local (never overrides real env vars)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v and k.strip() not in os.environ:
            os.environ[k.strip()] = v


def main() -> int:
    # Windows consoles default to a legacy code page that cannot print ₹ or ¥
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    load_env_file(ROOT / ".env.local")
    ap = argparse.ArgumentParser(description="Collect chemical market data")
    ap.add_argument("--sink", choices=["mongo", "json"], help="where to save (default: mongo if MONGODB_URI is set)")
    ap.add_argument("--only", nargs="*", choices=list(RUNNERS), help="run only these sources")
    ap.add_argument("--force", action="store_true", help="ignore per-source minimum intervals")
    ap.add_argument("--budget", type=float, help="minutes per marketplace source this run (default 9 IndiaMART / 10 TradeIndia / 8 ExportersIndia)")
    args = ap.parse_args()
    if args.budget:
        BUDGET_OVERRIDE.update(indiamart=args.budget, tradeindia=args.budget, exportersindia=args.budget)

    store = open_store(args.sink, ROOT / "data" / "snapshot")
    cat = load_catalog()
    log = lambda msg: print(msg, flush=True)  # noqa: E731
    failures, changed_any = 0, False

    for name in args.only or list(RUNNERS):
        last_ok = store.get_state(f"lastOk.{name}")
        if not args.force and last_ok and INTERVALS[name]:
            age = (now_utc() - dt.datetime.fromisoformat(last_ok)).total_seconds()
            # 30 min slack: scheduled runs start a few minutes late, so a 6 h source
            # must not be skipped at 5 h 55 m and wait until the 9 h run
            if age < INTERVALS[name] - 1800:
                log(f"[{name}] skipped - checked {age / 3600:.1f} h ago")
                continue
        log(f"[{name}]")
        t0, started = time.time(), now_utc()
        entry = {"source": name, "at": started.isoformat()}
        try:
            stats = RUNNERS[name](store, cat, log)
            errors = stats.pop("errors", []) if isinstance(stats, dict) else []
            entry.update(ok=True, **{k: v for k, v in stats.items() if k in ("new", "updated", "unchanged", "latest")})
            if errors:
                entry["warnings"] = errors[:10]
            store.set_state(f"lastOk.{name}", started.isoformat())
            changed_any = changed_any or bool(stats.get("new") or stats.get("updated"))
            log(f"  done: {stats.get('new', 0)} new, {stats.get('updated', 0)} changed, "
                f"{stats.get('unchanged', 0)} unchanged ({time.time() - t0:.0f}s)")
        except Exception as e:
            failures += 1
            entry.update(ok=False, error=str(e)[:500])
            log(f"  FAILED: {e}")
            traceback.print_exc()
        entry["seconds"] = round(time.time() - t0, 1)
        store.log_run(entry)

    # data checks (cheap; always run)
    log("[checks]")
    try:
        from collector.checks import run_checks

        results = run_checks(store, cat, log)
        store.log_run({"source": "checks", "at": now_utc().isoformat(), "ok": all(r["ok"] for r in results), "checks": results})
    except Exception as e:
        log(f"  checks failed to run: {e}")

    if changed_any:
        ping_site(log)
    else:
        log("No price changed in this run - no prices written.")
    store.close()
    return 1 if failures and failures == len(args.only or RUNNERS) else 0


if __name__ == "__main__":
    sys.exit(main())
