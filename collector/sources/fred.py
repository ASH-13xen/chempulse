"""Energy prices from FRED (Federal Reserve Bank of St. Louis).

Uses FRED's public CSV download, which needs no API key. Series come from the
US Energy Information Administration and are public domain. FRED publishes
them a few days after the trading date.
"""
from __future__ import annotations

import csv
import io

import requests

URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def fetch(series_code: str, since: str) -> list[dict]:
    r = requests.get(URL, params={"id": series_code, "cosd": since}, timeout=60,
                     headers={"User-Agent": "chempulse-collector/1.0"})
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
