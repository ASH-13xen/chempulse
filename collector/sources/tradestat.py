"""India's monthly imports from Tradestat (Department of Commerce, DGCI&S data).

Public government portal (robots.txt allows all). For each month it gives,
per 6-digit HS code, the import quantity (kg) and value (Rs crore). From those
we work out the average import price in Rs/kg and the import volume trend.
A second report gives the same split by origin country.

Politeness: one request per second, and the collector only asks for months it
does not have yet (plus a weekly re-check of the latest two months, which the
government revises).
"""
from __future__ import annotations

import datetime as dt
import html as htmllib
import re
import time

import requests

BASE = "https://tradestat.commerce.gov.in/meidb/"
TOTALS = BASE + "commoditywise_import"
ORIGINS = BASE + "commodity_wise_all_countries_import"
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}
MONTH_COL = re.compile(r"^([A-Za-z]{3})-\s*(\d{4})\s*\(\w+\)$")
YTD_COL = re.compile(r"^[A-Za-z]{3}-[A-Za-z]{3}\s*(\d{4})\s*\(\w+\)$")
MIN_QTY_KG = 5000  # below 5 tonnes a month the average price is too noisy to show


class Client:
    def __init__(self, pause: float = 1.0):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = "Mozilla/5.0 (compatible; chempulse-collector/1.0)"
        self.pause = pause
        self.pages: dict[str, tuple[str, str]] = {}

    def page(self, url: str, refresh: bool = False) -> tuple[str, str]:
        if refresh or url not in self.pages:
            r = self.s.get(url, timeout=60)
            r.raise_for_status()
            tok = re.search(r'name="_token" value="([^"]+)"', r.text)
            if not tok:
                raise RuntimeError(f"Tradestat form token not found on {url}")
            self.pages[url] = (tok.group(1), r.text)
        return self.pages[url]

    def post(self, url: str, data: dict) -> str:
        last = None
        for attempt in range(4):
            token, _ = self.page(url, refresh=attempt > 0)
            time.sleep(self.pause)
            r = self.s.post(url, data={"_token": token, **data}, headers={"Referer": url}, timeout=180)
            if r.status_code == 200:
                return r.text
            last = r.status_code
            time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"Tradestat returned HTTP {last} for {url}")

    def latest_month(self) -> str:
        _, page = self.page(TOTALS, refresh=True)

        def selected(name: str) -> int:
            m = re.search(rf'name="{name}"[^>]*>(.*?)</select>', page, re.S)
            sel = re.search(r'<option value="(\d+)"\s*selected', m.group(1)) if m else None
            if not sel:
                raise RuntimeError(f"Could not read the latest {name} from Tradestat")
            return int(sel.group(1))

        return f"{selected('imddYear')}-{selected('imddMonth'):02d}"


def _num(s: str):
    s = (s or "").replace(",", "").strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _table(page: str) -> tuple[list[str], list[list[str]]]:
    tb = re.search(r"<table.*?</table>", page, re.S)
    if not tb:
        return [], []
    rows = []
    for tr in re.findall(r"<tr.*?</tr>", tb.group(0), re.S):
        cells = [re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", c))).strip()
                 for c in re.findall(r"<t[hd].*?</t[hd]>", tr, re.S)]
        if cells:
            rows.append(cells)
    return (rows[0], rows[1:]) if rows else ([], [])


def _month_cols(header: list[str]) -> list[tuple[int, str]]:
    out = []
    for i, h in enumerate(header):
        m = MONTH_COL.match(h)
        if m and m.group(1) in MONTHS:
            out.append((i, f"{m.group(2)}-{MONTHS[m.group(1)]:02d}"))
    return out


def _ytd_cols(header: list[str]) -> list[int]:
    return [i for i, h in enumerate(header) if YTD_COL.match(h)]


def _qty_factor(unit: str) -> float | None:
    u = (unit or "").upper().strip()
    if u in ("", "KGS", "KG"):
        return 1.0
    if u in ("TON", "TNS", "MTS", "MT"):
        return 1000.0
    return None  # litres, numbers etc. cannot be turned into kg


def month_range(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def collect(store, chemicals: list[dict], start: str = "2023-01", log=print) -> dict:
    c = Client()
    latest = c.latest_month()
    log(f"  latest month on Tradestat: {latest}")
    wanted = {hs for ch in chemicals for hs in ch["hs"]}

    have = set(store.get_state("tradestat.months", []))
    refreshed = store.get_state("tradestat.refreshedAt")
    targets = month_range(start, latest)
    force = set()
    if not refreshed or dt.datetime.fromisoformat(refreshed) < dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7):
        force = set(targets[-2:])

    filled: dict[str, dict[str, dict]] = {}
    totals: dict[str, float] = {}  # month -> India's total imports, Rs crore
    queried: list[str] = []
    for month in sorted(set(t for t in targets if t not in have) | force, reverse=True):
        if month in filled and month not in force:
            continue  # already supplied by a later month's "same month last year" column
        y, m = month.split("-")
        for report, key in (("2", "q"), ("3", "val")):
            page = c.post(TOTALS, {"imddMonth": int(m), "imddYear": y, "comlev": "all",
                                   "imddCommodityLevel": 6, "imddReportVal": report, "imddReportYear": 1})
            header, body = _table(page)
            cols = _month_cols(header)
            unit_idx = header.index("UNIT") if "UNIT" in header else None
            if not cols:
                raise RuntimeError(f"Unexpected Tradestat table for {month}: {header}")
            for _, col_month in cols:
                filled.setdefault(col_month, {})
            for row in body:
                if key == "val" and len(row) > 2 and "total import" in row[2].lower():
                    for idx, col_month in cols:
                        v = _num(row[idx]) if idx < len(row) else None
                        if v is not None:
                            totals[col_month] = v
                    continue
                if len(row) < 3 or row[1] not in wanted:
                    continue
                factor = 1.0
                if key == "q" and unit_idx is not None:
                    factor = _qty_factor(row[unit_idx])
                    if factor is None:
                        continue
                for idx, col_month in cols:
                    val = _num(row[idx]) if idx < len(row) else None
                    if val is not None:
                        filled[col_month].setdefault(row[1], {})[key] = val * (factor if key == "q" else 1.0)
        queried.append(month)
        log(f"  fetched {month}")

    stats = {"new": 0, "updated": 0, "unchanged": 0}
    if filled:
        for ch in chemicals:
            pts = []
            for month in sorted(filled):
                codes = filled[month]
                q = sum(codes.get(hs, {}).get("q") or 0 for hs in ch["hs"])
                val = sum(codes.get(hs, {}).get("val") or 0 for hs in ch["hs"])
                price = round(val * 1e7 / q, 2) if q >= MIN_QTY_KG and val > 0 else None
                pts.append({"d": f"{month}-01", "v": price, "q": round(q), "val": round(val, 4)})
            r = store.save_points(f"imp-{ch['id']}", pts)
            for k in stats:
                stats[k] += r[k]
        store.set_state("tradestat.months", sorted(have | set(filled)))
    if force:
        store.set_state("tradestat.refreshedAt", dt.datetime.now(dt.timezone.utc).isoformat())

    # India's total merchandise imports (Rs crore) - one small request per missing month.
    have_tot = set(store.get_points("in-total-imports").keys())
    for month in sorted(targets, reverse=True)[:30]:
        if f"{month}-01" in have_tot or month in totals:
            continue
        y, m = month.split("-")
        page = c.post(TOTALS, {"imddMonth": int(m), "imddYear": y, "comlev": "specific", "comval": "290230",
                               "imddCommodityLevel": 6, "imddReportVal": 3, "imddReportYear": 1})
        header, body = _table(page)
        cols = _month_cols(header)
        for row in body:
            if len(row) > 2 and "total import" in row[2].lower():
                for idx, col_month in cols:
                    v = _num(row[idx]) if idx < len(row) else None
                    if v is not None:
                        totals[col_month] = v
        have_tot |= {f"{k}-01" for k in totals}
    if totals:
        r = store.save_points("in-total-imports", [{"d": f"{k}-01", "v": v} for k, v in sorted(totals.items())])
        log(f"  India total imports: {r['new']} new months, {r['updated']} revised")

    # Origin countries for the latest month (fiscal-year-to-date shares too).
    if store.get_state("tradestat.originsMonth") != latest or force:
        y, m = latest.split("-")
        changed = 0
        for ch in chemicals:
            countries: dict[str, dict] = {}
            for hs in ch["hs"]:
                for report, key in (("2", "q"), ("3", "val")):
                    page = c.post(ORIGINS, {"cwacimMonth": int(m), "cwacimYear": y, "cwacimHSCODE": hs,
                                            "cwacimReportVal": report, "cwacimReportYear": 1})
                    header, body = _table(page)
                    mcols, ycols = _month_cols(header), _ytd_cols(header)
                    if not mcols or "Country" not in header:
                        continue
                    ci = header.index("Country")
                    cur = mcols[-1][0]
                    ytd = ycols[-1] if ycols else None
                    for row in body:
                        if not row or not row[0].isdigit() or len(row) <= cur:
                            continue
                        rec = countries.setdefault(row[ci].title(), {"q": 0.0, "val": 0.0, "qYtd": 0.0, "valYtd": 0.0})
                        rec[key] += _num(row[cur]) or 0
                        if ytd is not None and ytd < len(row):
                            rec[key + "Ytd"] += _num(row[ytd]) or 0
            rows = [{"country": k, **{kk: round(vv, 4) for kk, vv in v.items()}}
                    for k, v in countries.items() if v["qYtd"] > 0 or v["q"] > 0]
            rows.sort(key=lambda r: r["qYtd"], reverse=True)
            if rows and store.save_origins(ch["id"], latest, rows):
                changed += 1
        store.set_state("tradestat.originsMonth", latest)
        log(f"  origin countries updated for {changed} chemicals ({latest})")

    stats["months"] = queried
    stats["latest"] = latest
    return stats
