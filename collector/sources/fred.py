"""Energy prices from FRED (Federal Reserve Bank of St. Louis), with the US EIA as fallback.

FRED's public CSV download needs no API key. Its crude, gas and propane series are
republished from the US Energy Information Administration, so when FRED is slow or
refuses a server (it sometimes times out for cloud machines such as GitHub's), the
same daily numbers are read straight from the EIA's public spreadsheets instead.
Both sources are public domain and publish a few days after the trading date.
"""
from __future__ import annotations

import csv
import io

import requests

URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
UA = {"User-Agent": "chempulse-collector/1.0"}

# FRED series -> identical EIA daily spot series (same values, same dates)
EIA = {
    "DCOILBRENTEU": "https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls",  # Brent spot, $/bbl
    "DCOILWTICO": "https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls",  # WTI Cushing spot, $/bbl
    "DHHNGSP": "https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls",  # Henry Hub spot, $/MMBtu
    "DPROPANEMBTX": "https://www.eia.gov/dnav/pet/hist_xls/EER_EPLLPA_PF4_Y44MB_DPGd.xls",  # Mont Belvieu propane, $/gal
}

# Once FRED has failed in this run, later series go straight to the EIA instead of
# waiting for another timeout.
_fred_down = False
last_source = "FRED"


def _from_fred(series_code: str, since: str) -> list[dict]:
    r = requests.get(URL, params={"id": series_code, "cosd": since}, timeout=(10, 40), headers=UA)
    r.raise_for_status()
    out = []
    for row in csv.DictReader(io.StringIO(r.text)):
        d = row.get("observation_date") or row.get("DATE")
        raw = row.get(series_code, "")
        if not d or d < since or raw in ("", "."):
            continue
        try:
            v = float(raw)
        except ValueError:
            continue
        out.append({"d": d, "v": v})
    return out


def _from_eia(series_code: str, since: str) -> list[dict]:
    import xlrd

    r = requests.get(EIA[series_code], timeout=(10, 60), headers=UA)
    r.raise_for_status()
    book = xlrd.open_workbook(file_contents=r.content)
    sheet = book.sheet_by_name("Data 1")
    out = []
    for i in range(3, sheet.nrows):  # rows 0-2 are titles
        when, raw = sheet.cell_value(i, 0), sheet.cell_value(i, 1)
        if not isinstance(when, float) or raw in ("", None):
            continue
        d = xlrd.xldate_as_datetime(when, book.datemode).date().isoformat()
        if d < since:
            continue
        try:
            out.append({"d": d, "v": float(raw)})
        except (TypeError, ValueError):
            continue
    return out


def fetch(series_code: str, since: str) -> list[dict]:
    """Daily points since `since`. Tries FRED first, then the EIA for energy series."""
    global _fred_down, last_source
    if not _fred_down:
        try:
            pts = _from_fred(series_code, since)
            last_source = "FRED"
            return pts
        except Exception:
            _fred_down = True
            if series_code not in EIA:
                raise
    if series_code not in EIA:
        raise RuntimeError("FRED unreachable this run")
    pts = _from_eia(series_code, since)
    last_source = "EIA"
    return pts
