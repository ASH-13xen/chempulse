"""Exchange rates from Frankfurter (European Central Bank reference rates).

Free, no key. ECB publishes once per working day around 16:00 CET.
Returns two series: rupees per US dollar and rupees per Chinese yuan.
"""
from __future__ import annotations

import datetime as dt

import requests

URL = "https://api.frankfurter.dev/v1/{start}..{end}"


def fetch(since: str) -> dict[str, list[dict]]:
    start = dt.date.fromisoformat(since)
    today = dt.date.today()
    usd, cny = [], []
    # Ask for one year at a time so every working day is returned.
    while start <= today:
        end = min(dt.date(start.year, 12, 31), today)
        r = requests.get(URL.format(start=start.isoformat(), end=end.isoformat()),
                         params={"base": "USD", "symbols": "INR,CNY"}, timeout=60)
        r.raise_for_status()
        for d, rates in sorted(r.json().get("rates", {}).items()):
            inr, yuan = rates.get("INR"), rates.get("CNY")
            if inr:
                usd.append({"d": d, "v": round(inr, 4)})
            if inr and yuan:
                cny.append({"d": d, "v": round(inr / yuan, 4)})
        start = end + dt.timedelta(days=1)
    return {"usdinr": usd, "cnyinr": cny}
