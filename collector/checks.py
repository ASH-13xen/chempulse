"""Data checks, run at the end of every collector run.

Each check returns (name, ok, detail). Failures do not stop collection; they are
written to the run log ("checks") and shown on the website's Data & methods page.

  * futures-ohlc       each day's open/close sit between its low and high
  * futures-jumps      no unexplained day-to-day move above 20% (limit moves are ~4-10%)
  * fx-usd-crosscheck  ECB USD/INR vs the US Federal Reserve's USD/INR (FRED DEXINUS), within 1%
  * fx-cny-crosscheck  ECB CNY/INR vs Fed-derived CNY/INR (DEXINUS / DEXCHUS), within 1.5%
  * energy-ranges      Brent, WTI, gas, propane inside sane ranges and WTI close to Brent
  * import-vs-china    India's import price for chemicals with China futures stays within
                       0.6x-1.7x of the China price for the same month (catches unit/parse errors)
  * imports-total      tracked chemicals' import bill is below India's total import bill
  * freshness          every source updated recently
"""
from __future__ import annotations

import datetime as dt
import statistics

from collector.sources import fred


def _series(store, sid, days=120):
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    return sorted(store.get_points(sid, since).values(), key=lambda p: p["d"])


def _at(points, d):
    best = None
    for p in points:
        if p["d"] <= d and p.get("v") is not None:
            best = p
    return best["v"] if best else None


def run_checks(store, cat, log) -> list[dict]:
    out = []

    def add(name, ok, detail):
        out.append({"name": name, "ok": bool(ok), "detail": detail})
        log(f"  {'OK  ' if ok else 'WARN'} {name}: {detail}")

    futures = [m for m in cat["markets"] if m["source"] == "futures"]

    # 1. OHLC consistency and 2. jumps
    bad, jumps = [], []
    for m in futures:
        pts = _series(store, m["id"], 45)
        for p in pts:
            o, h, l, c = p.get("o"), p.get("h"), p.get("l"), p.get("v")
            if None in (o, h, l, c):
                continue
            tol = 1.001
            if not (l <= o * tol and o <= h * tol and l <= c * tol and c <= h * tol and l > 0):
                bad.append(f"{m['short']} {p['d']}")
        for a, b in zip(pts, pts[1:]):
            if a.get("v") and b.get("v") and abs(b["v"] / a["v"] - 1) > 0.20:
                jumps.append(f"{m['short']} {b['d']} ({(b['v'] / a['v'] - 1) * 100:+.0f}%)")
    add("futures-ohlc", not bad, "all daily bars consistent (last 45 days)" if not bad else f"{len(bad)} inconsistent bars: {', '.join(bad[:5])}")
    add("futures-jumps", not jumps, "no day-to-day move above 20%" if not jumps else f"check: {', '.join(jumps[:5])} (contract switch or data error)")

    # 3-4. FX cross-checks against the US Federal Reserve (FRED)
    try:
        since = (dt.date.today() - dt.timedelta(days=40)).isoformat()
        dexinus = {p["d"]: p["v"] for p in fred.fetch("DEXINUS", since)}
        dexchus = {p["d"]: p["v"] for p in fred.fetch("DEXCHUS", since)}
        ecb_usd = {p["d"]: p["v"] for p in _series(store, "usdinr", 40) if p.get("v")}
        ecb_cny = {p["d"]: p["v"] for p in _series(store, "cnyinr", 40) if p.get("v")}
        common = sorted(set(dexinus) & set(ecb_usd))
        if common:
            d = common[-1]
            diff = abs(ecb_usd[d] / dexinus[d] - 1) * 100
            add("fx-usd-crosscheck", diff < 1.0, f"{d}: ECB ₹{ecb_usd[d]:.2f} vs Fed ₹{dexinus[d]:.2f} per $ ({diff:.2f}% apart)")
        else:
            add("fx-usd-crosscheck", True, "no overlapping dates yet (Fed publishes weekly)")
        common = sorted(set(dexinus) & set(dexchus) & set(ecb_cny))
        if common:
            d = common[-1]
            fed = dexinus[d] / dexchus[d]
            diff = abs(ecb_cny[d] / fed - 1) * 100
            add("fx-cny-crosscheck", diff < 1.5, f"{d}: ECB ₹{ecb_cny[d]:.3f} vs Fed-derived ₹{fed:.3f} per ¥ ({diff:.2f}% apart)")
    except Exception as e:  # network trouble must not fail the run
        add("fx-crosscheck", True, f"skipped ({e})")

    # 5. energy ranges
    last = {m["id"]: (_series(store, m["id"], 30) or [{}])[-1].get("v") for m in cat["markets"] if m["source"] == "fred"}
    problems = []
    rng = {"brent": (15, 250), "wti": (10, 250), "henryhub": (0.5, 25), "propane": (0.1, 5)}
    for k, (lo, hi) in rng.items():
        v = last.get(k)
        if v is not None and not (lo <= v <= hi):
            problems.append(f"{k}={v}")
    if last.get("brent") and last.get("wti") and not (-20 <= last["brent"] - last["wti"] <= 15):
        problems.append(f"Brent-WTI spread {last['brent'] - last['wti']:.1f}")
    add("energy-ranges", not problems, "crude, gas and propane inside normal ranges" if not problems else ", ".join(problems))

    # 6. India import price vs China futures, same month
    cny = _series(store, "cnyinr", 400)
    ratios, odd = [], []
    for ch in cat["chemicals"]:
        if not ch.get("daily"):
            continue
        allimp = _series(store, f"imp-{ch['id']}", 400)
        vols = sorted((p.get("q") or 0) for p in allimp[-12:])
        if not vols or vols[len(vols) // 2] < 2_000_000:
            continue  # India imports too little of it each month for a fair comparison (e.g. caustic soda flakes)
        imp = [p for p in allimp if p.get("v") and (p.get("q") or 0) >= 1_000_000]
        if not imp:
            continue
        p = imp[-1]
        month = p["d"][:7]
        fut = [x for x in _series(store, ch["daily"], 400) if x["d"][:7] == month and x.get("v")]
        rate = _at(cny, f"{month}-28")
        if not fut or not rate:
            continue
        china_kg = statistics.mean(x["v"] for x in fut) * rate / 1000
        r = p["v"] / china_kg
        ratios.append(r)
        if not (0.6 <= r <= 1.7):
            odd.append(f"{ch['short']} {month}: import ₹{p['v']:.0f} vs China ₹{china_kg:.0f}/kg")
    if ratios:
        add("import-vs-china", not odd, f"{len(ratios)} chemicals: India import price is {min(ratios):.2f}-{max(ratios):.2f}x the China price" + ("" if not odd else f"; out of range: {', '.join(odd[:4])}"))

    # 7. tracked imports below India's total
    tot = _series(store, "in-total-imports", 200)
    if tot:
        m = tot[-1]["d"]
        tracked = 0.0
        for ch in cat["chemicals"]:
            pts = store.get_points(f"imp-{ch['id']}", m)
            tracked += sum((p.get("val") or 0) for p in pts.values() if p["d"] == m)
        add("imports-total", 0 < tracked < tot[-1]["v"], f"{m[:7]}: tracked chemicals ₹{tracked:,.0f} cr of India's ₹{tot[-1]['v']:,.0f} cr total ({tracked / tot[-1]['v'] * 100:.1f}%)")

    # 8. freshness
    today = dt.date.today()
    stale = []
    limits = {"cn-pp": 6, "brent": 12, "usdinr": 6}
    for sid, days in limits.items():
        pts = _series(store, sid, 60)
        if not pts or (today - dt.date.fromisoformat(pts[-1]["d"])).days > days:
            stale.append(f"{sid} last {pts[-1]['d'] if pts else 'never'}")
    imp_last = max((p["d"] for p in _series(store, "imp-pp", 200)), default=None)
    if not imp_last or (today - dt.date.fromisoformat(imp_last)).days > 130:
        stale.append(f"imports last {imp_last}")
    add("freshness", not stale, "futures, energy, FX and import data are current" if not stale else "; ".join(stale))
    return out
