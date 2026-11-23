"""Recent headlines per chemical from Google News RSS (India edition).

RSS feeds are offered for feed readers; we read one small feed per chemical
at most every 6 hours and store only the headline, source, date and link.

Relevance rules (to keep out market-research spam and off-topic stories):
  * the search asks for the chemical together with price/supply words;
  * the chemical's name (or acronym) must appear in the headline itself,
    together with a trade word (price, duty, plant, supply, demand…);
  * "market size / share / forecast / CAGR" report headlines are dropped.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import re
import time
import xml.etree.ElementTree as ET

import requests

URL = "https://news.google.com/rss/search"
TOPIC = "(price OR prices OR plant OR imports OR import OR duty OR demand OR supply OR capacity OR shortage OR outage)"
CONTEXT = re.compile(r"price|prices|priced|rate|rates|tariff|duty|dumping|import|export|plant|capacity|demand|supply|shortage|outage|resin|polymer|petrochem|chemical|tonne|production|output|fertili[sz]er|crop|kharif|rabi|kharif|subsid|refiner|cracker|margin|spread|feedstock|inventor|sales|volume", re.I)
SPAM = re.compile(r"market (size|share|report|research|analysis|outlook|forecast|growth|trends?)|\bcagr\b|forecast to 20\d\d|to reach \$|market to (reach|grow|witness)|market,? 20\d\d|plant setup|setup cost|business plan|feasibility|project report|stock analysis|\|.*\|", re.I)


def _matcher(terms: list[str]):
    pats = []
    for t in terms:
        if len(t) <= 4 and t.isupper():  # acronyms: exact, case-sensitive word (PTA, MEK, LAB…)
            pats.append(re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])"))
        else:
            pats.append(re.compile(rf"\b{re.escape(t)}", re.I))
    return lambda title: any(p.search(title) for p in pats)


def fetch(chem_id: str, query: str, days: int = 30, limit: int = 10) -> list[dict]:
    from ..store import news_id

    terms = [t.strip() for t in query.split("|") if t.strip()]
    q = "(" + " OR ".join(f'"{t}"' for t in terms) + f") {TOPIC} when:{days}d"
    r = requests.get(URL, params={"q": q, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}, timeout=30,
                     headers={"User-Agent": "Mozilla/5.0 (compatible; chempulse-collector/1.0)"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    relevant = _matcher(terms)
    out, seen_titles = [], set()
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate")
        src = item.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if not title or not link or not pub:
            continue
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        if not relevant(title) or not CONTEXT.search(title) or SPAM.search(title):
            continue
        key = re.sub(r"\W+", " ", title.lower()).strip()[:80]
        if key in seen_titles:
            continue
        seen_titles.add(key)
        try:
            published = email.utils.parsedate_to_datetime(pub).astimezone(dt.timezone.utc)
        except (TypeError, ValueError):
            continue
        out.append({"id": news_id(f"{chem_id}|{link}"), "chem": chem_id, "title": title, "source": source,
                    "link": link, "published": published.replace(microsecond=0).isoformat()})
    out.sort(key=lambda n: n["published"], reverse=True)
    time.sleep(1.0)
    return out[:limit]


REG_WORDS = re.compile(r"anti.?dumping|dgtr|safeguard|countervailing|customs duty|import duty|basic customs|\bbcd\b|quality control order|\bqco\b|\bbis\b|fssai|cdsco|cib.?rc|insecticides act|\bpeso\b|export ban|import ban|restrict|notification|gazette|tariff", re.I)
REG_QUERY = '("anti-dumping" OR DGTR OR "safeguard duty" OR "customs duty" OR "import duty" OR "quality control order" OR BIS OR FSSAI OR CDSCO OR "CIB&RC" OR "Insecticides Act" OR PESO OR tariff)'


def fetch_regulatory(category_id: str, chemicals: list[dict], days: int = 30, limit: int = 12) -> list[dict]:
    """Regulatory and trade-policy headlines for a category's chemicals."""
    from ..store import news_id

    names = []
    for ch in chemicals:
        names += [t for t in ch["news"].split("|") if len(t) > 4 or not t.isupper()]
    names = list(dict.fromkeys(names))[:12]
    if not names:
        return []
    q = "(" + " OR ".join(f'"{t}"' for t in names) + f") {REG_QUERY} when:{days}d"
    r = requests.get(URL, params={"q": q, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}, timeout=30,
                     headers={"User-Agent": "Mozilla/5.0 (compatible; chempulse-collector/1.0)"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    matchers = [(ch["id"], _matcher([t.strip() for t in ch["news"].split("|") if t.strip()])) for ch in chemicals]
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate")
        src = item.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if not title or not link or not pub:
            continue
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        if not REG_WORDS.search(title) or SPAM.search(title):
            continue
        chem = next((cid for cid, m in matchers if m(title)), None)
        if not chem:
            continue
        try:
            published = email.utils.parsedate_to_datetime(pub).astimezone(dt.timezone.utc)
        except (TypeError, ValueError):
            continue
        out.append({"id": news_id(f"reg|{chem}|{link}"), "chem": chem, "kind": "regulatory", "category": category_id,
                    "title": title, "source": source, "link": link, "published": published.replace(microsecond=0).isoformat()})
    time.sleep(1.0)
    out.sort(key=lambda n: n["published"], reverse=True)
    return out[:limit]
