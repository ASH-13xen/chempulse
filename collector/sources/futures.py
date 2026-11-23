"""China futures: daily open/high/low/close for the main (continuous) contract.

Data: Dalian, Zhengzhou and Shanghai exchanges, read through the free AkShare
library (it pulls the exchanges' public daily quotes via Sina Finance).
During Chinese trading hours the latest day's bar updates as prices move, so
the 3-hourly collector picks up intraday changes for "today".
"""
from __future__ import annotations

import math
import warnings

warnings.filterwarnings("ignore")


def _num(x):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def fetch(symbol: str, since: str) -> list[dict]:
    import akshare as ak  # imported lazily: it is slow to load

    df = ak.futures_zh_daily_sina(symbol=symbol)
    out = []
    for r in df.itertuples(index=False):
        d = str(r.date)[:10]
        if d < since:
            continue
        close = _num(r.close)
        if close is None or close <= 0:
            continue
        out.append(
            {
                "d": d,
                "v": close,
                "o": _num(r.open),
                "h": _num(r.high),
                "l": _num(r.low),
                "vol": _num(r.volume),
                "oi": _num(getattr(r, "hold", None)),
            }
        )
    return out
