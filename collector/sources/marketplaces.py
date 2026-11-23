"""Seller listings from B2B marketplaces (IndiaMART, TradeIndia, ExportersIndia).

How it behaves:
  * reads only public listing pages that the site's robots.txt allows;
  * one page every few seconds per site, inside a time budget per run, so a
    full pass over every product and city is spread across the day;
  * a page is re-read at most once every ~20 hours;
  * if a site answers "too many requests" / "forbidden" or shows a CAPTCHA,
    that site is paused for 6 hours. No proxies, no disguises, no CAPTCHA solving.

Each listing is matched to a product (config/products.json), its price is
parsed and converted to Rs/kg where possible, and lab/small-pack listings are flagged.
"""
from __future__ import annotations

import datetime as dt
import json
import random
import re
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests

UA = "Mozilla/5.0 (compatible; chempulse-collector/1.0)"
ROBOTS_AGENT = "chempulse-collector"
REFETCH_HOURS = 20

# IndiaMART rate-limits quickly (HTTP 429 after ~50 fast requests), so it is read slowly and in
# small batches: a full pass over every product and city takes about three days.
SOURCES = {
    "indiamart": {"label": "IndiaMART", "delay": (10.0, 16.0), "budget": 9 * 60, "max_pages": 40},
    "tradeindia": {"label": "TradeIndia", "delay": (2.5, 4.0), "budget": 10 * 60, "max_pages": 250},
    "exportersindia": {"label": "ExportersIndia", "delay": (3.0, 5.0), "budget": 8 * 60, "max_pages": 150},
}
SLUG_KEY = {"indiamart": "im", "tradeindia": "ti", "exportersindia": "ei"}
STATES = {s.lower() for s in ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
          "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
          "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Jammu and Kashmir",
          "Jammu & Kashmir", "Chandigarh", "Puducherry", "Dadra and Nagar Haveli", "Daman and Diu", "Ladakh", "Lakshadweep"]}


class Blocked(Exception):
    pass


class Polite:
    def __init__(self, delay: tuple[float, float]):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9"})
        self.delay = delay
        self.last = 0.0
        self.robots: dict[str, urllib.robotparser.RobotFileParser] = {}

    def allowed(self, url: str) -> bool:
        host = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        if host not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.s.get(host + "/robots.txt", timeout=30)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])
            self.robots[host] = rp
        return self.robots[host].can_fetch(ROBOTS_AGENT, url)

    def get(self, url: str) -> requests.Response:
        if not self.allowed(url):
            raise PermissionError(f"robots.txt disallows {url}")
        wait = self.last + random.uniform(*self.delay) - time.time()
        if wait > 0:
            time.sleep(wait)
        r = self.s.get(url, timeout=45, allow_redirects=True)
        self.last = time.time()
        if r.status_code in (403, 429, 503) or re.search(r"captcha|are you a robot|unusual traffic", r.text[:5000], re.I):
            raise Blocked(f"{urlparse(url).netloc} answered {r.status_code}")
        return r


# ----------------------------------------------------------------------------- parsing helpers

def _json_after(html: str, marker: str):
    i = html.find(marker)
    if i < 0:
        return None
    j = html.find("=", i) + 1
    try:
        obj, _ = json.JSONDecoder().raw_decode(html[j:].lstrip())
        return obj
    except ValueError:
        return None


def _next_data(html: str):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def _find_key(o, key):
    if isinstance(o, dict):
        if key in o:
            return o[key]
        for v in o.values():
            r = _find_key(v, key)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = _find_key(v, key)
            if r is not None:
                return r
    return None


def parse_indiamart(html: str) -> dict:
    st = _json_after(html, "window.__INITIAL_STATE__")
    if not isinstance(st, dict):
        return {"title": None, "total": 0, "cities": [], "listings": []}
    out = []
    for x in st.get("data") or []:
        isq = {(e.get("MASTER_DESC") or "").strip(): (e.get("OPTIONS_DESC") or "").strip() for e in (x.get("isq") or [])}
        out.append({
            "id": str(x.get("disp_id") or x.get("p_url")),
            "title": (x.get("p_nm") or x.get("f_nm") or "").strip(),
            "company": (x.get("CMP") or "").strip(),
            "city": (x.get("city") or "").strip(),
            "state": "",
            "priceText": (x.get("pr") or "").strip(),
            "unitText": "",
            "url": x.get("p_url") or "",
            "pack": isq.get("Packaging Size") or isq.get("Pack Size") or isq.get("Packaging Type") or "",
            "grade": " ".join(v for k, v in isq.items() if k in ("Grade", "Grade Standard", "Purity", "Purity %"))[:80],
            "memberYears": _years(x.get("m_sn")),
            "gstVerified": bool(x.get("gst_no")),
            "rating": x.get("wt_avg") or None,
            "ratings": x.get("tr_c") or None,
            "types": {},
        })
    return {
        "title": st.get("mcatname"),
        "total": st.get("totalResults") or 0,
        "cities": [(c.get("cityName"), c.get("cityFlName")) for c in (st.get("citybar") or []) if c.get("cityFlName")],
        "listings": out,
    }


def parse_tradeindia(html: str) -> dict:
    nd = _next_data(html)
    if not nd:
        return {"title": None, "total": 0, "cities": [], "listings": []}
    mc = _find_key(nd, "mcatData") or {}
    ld = mc.get("listing_data") or _find_key(nd, "listing_data") or {}
    # national pages: {"listing_data": [...], "listing_count": n}; city pages may nest differently
    if isinstance(ld, list):
        rows, ld = ld, {}
    else:
        rows = ld.get("listing_data") if isinstance(ld.get("listing_data"), list) else []
    if not rows:
        found = _find_listing_rows(nd)
        if found:
            rows = found
    out = []
    for x in rows or []:
        cf = x.get("custom_field_data_meta_info") or {}
        pq = {e.get("label_name"): e.get("value") for e in (cf.get("Price_And_Quantity") or [])} if isinstance(cf, dict) else {}
        price = x.get("price_es") if x.get("price_es") not in (None, "", 0) else x.get("price")
        url = x.get("prod_url") or ""
        out.append({
            "id": str(x.get("product_id") or url),
            "title": (x.get("product_name") or x.get("long_tail_prod_name") or "").strip(),
            "company": (x.get("co_name") or "").strip(),
            "city": (x.get("city") or "").strip(),
            "state": (x.get("state") or "").strip(),
            "priceText": str(price) if price not in (None, "") else "",
            "unitText": pq.get("Unit of Price") or pq.get("Unit of Measure") or "",
            "url": urljoin("https://www.tradeindia.com", url) if url else "",
            "pack": "",
            "grade": (x.get("short_product_spec") or "")[:80] if isinstance(x.get("short_product_spec"), str) else "",
            "memberYears": _years(x.get("member_since")),
            "gstVerified": bool(x.get("has_ti_verified")),
            "rating": None,
            "ratings": None,
            "types": {k: bool(x.get(f)) for k, f in (("manufacturer", "ifmanu"), ("trader", "iftrader"), ("distributor", "ifdistributor"), ("exporter", "ifexporter"), ("supplier", "ifsupplier"))},
        })
    title = ld.get("title") if isinstance(ld, dict) else None
    cities = [(c.get("city_name"), c.get("url")) for c in (mc.get("list_city_data") or _find_key(nd, "list_city_data") or []) if c.get("url")]
    total = (ld.get("listing_count") if isinstance(ld, dict) else 0) or _find_key(nd, "listing_count") or len(out)
    return {"title": title, "total": total, "cities": cities, "listings": out}


def _find_listing_rows(o):
    """Any list of dicts that look like product listings (have co_name and product_id)."""
    if isinstance(o, list):
        if o and isinstance(o[0], dict) and "co_name" in o[0] and ("product_id" in o[0] or "prod_url" in o[0]):
            return o
        for v in o:
            r = _find_listing_rows(v)
            if r:
                return r
    elif isinstance(o, dict):
        for v in o.values():
            r = _find_listing_rows(v)
            if r:
                return r
    return None


def _clean(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip()


def parse_exportersindia(html: str) -> dict:
    """Listing cards are plain HTML: <div class="l3Inn" id="id_N_<id>"> ... product, price, specs, company."""
    import html as htmllib

    out = []
    for chunk in html.split('<div class="l3Inn')[1:]:
        m_id = re.search(r'id="id_\d+_(\d+)"', chunk[:200])
        m_a = re.search(r'<a\b([^>]*class="prdclk"[^>]*)>(.*?)</a>', chunk, re.S)
        m_h = re.search(r'href="([^"]+)"', m_a.group(1)) if m_a else None
        m_t = (m_h.group(1), m_a.group(2)) if (m_a and m_h) else None
        m_c = re.search(r'class="com_nam"[^>]*>(.*?)</a>', chunk, re.S)
        if not (m_t and m_c):
            continue
        tip = re.search(r'class="_price[^"]*"\s+data-tooltip="([^"]*)"', chunk)
        price_text, unit_text = "", ""
        if tip:
            pt = htmllib.unescape(tip.group(1))  # "Price - Rs 120 - Rs 190 Per Ltr"
            nums = [float(x.replace(",", "")) for x in re.findall(r"Rs\s*([\d,]+(?:\.\d+)?)", pt)]
            per = re.search(r"Per\s+(.+)$", pt)
            if nums:
                mid = sum(nums) / len(nums)
                price_text = f"₹ {mid:g}" + (f" (range {nums[0]:g}-{nums[-1]:g})" if len(nums) > 1 else "")
                unit_text = per.group(1).strip() if per else ""
        attrs = {htmllib.unescape(_clean(a)).rstrip(" :"): htmllib.unescape(_clean(b)) for a, b in re.findall(r'<span class="eipdt-lbl">(.*?)</span>\s*<span class="eipdt-val">(.*?)</span>', chunk, re.S)}
        loc = re.search(r'class="_fAdre">\s*<span class="title_tooltip"[^>]*>(.*?)</span>', chunk, re.S)
        parts = [p.strip() for p in htmllib.unescape(_clean(loc.group(1))).split(",")] if loc else []
        if parts and parts[-1].lower() in STATES:
            state = parts[-1]
            city = parts[-2] if len(parts) >= 2 else ""
        else:
            state = ""
            city = parts[-1] if parts else ""
        years = re.search(r"<span>(\d+)\s+Years?</span>", chunk)
        rating = re.search(r"<strong>([\d.]+)</strong>/5\s*<span[^>]*>\((\d+)\)", chunk)
        out.append({
            "id": m_id.group(1) if m_id else m_t[0],
            "title": htmllib.unescape(_clean(m_t[1])),
            "company": htmllib.unescape(_clean(m_c.group(1))),
            "city": city,
            "state": state,
            "priceText": price_text,
            "unitText": unit_text,
            "url": m_t[0],
            "pack": attrs.get("Packaging Size") or attrs.get("Packaging Details") or attrs.get("Pack Size") or "",
            "grade": " ".join(v for k, v in attrs.items() if k in ("Grade", "Purity", "Purity %"))[:80],
            "memberYears": int(years.group(1)) if years else None,
            "gstVerified": "<span>GST</span>" in chunk,
            "rating": float(rating.group(1)) if rating else None,
            "ratings": int(rating.group(2)) if rating else None,
            "types": {},
        })
    title = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    links = re.findall(r'href="https://www\.exportersindia\.com/([a-z-]+)/([a-z0-9-]+)\.htm"', html)
    skip = {"indian-suppliers", "indian-manufacturers", "product-detail"}
    from collections import Counter

    slugs = Counter(sl for c, sl in links if c not in skip)
    cities = []
    if slugs:
        slug = slugs.most_common(1)[0][0]
        seen = set()
        for c, sl in links:
            if sl == slug and c not in skip and c not in seen:
                seen.add(c)
                cities.append((c.replace("-", " ").title(), f"https://www.exportersindia.com/{c}/{slug}.htm"))
    return {"title": _clean(title.group(1)) if title else None, "total": len(out), "cities": cities[:25], "listings": out}


def _years(v):
    if v is None:
        return None
    m = re.search(r"\d+", str(v))
    return int(m.group(0)) if m else None


# ----------------------------------------------------------------------------- matching & prices

GLOBAL_EXCLUDE = re.compile(r"machine|plant\b|equipment|test kit|analy[sz]er|\bpump\b|dispenser|service|consult|software|\btank\b|detector|meter\b|scrubber|reactor", re.I)
LAB = re.compile(r"\b(lr|ar|gr|acs|hplc|ultra ?pure|lab(oratory)?|reagent|analytical|extra pure|for synthesis|spectroscop|emparta|emsure)\b", re.I)
UNITS = {
    "kg": ["kg", "kgs", "kilogram", "kilograms", "kilo"],
    "L": ["l", "ltr", "ltrs", "litre", "litres", "liter", "liters", "lt", "ltr."],
    "t": ["ton", "tons", "tonne", "tonnes", "metric ton", "metric tons", "mt"],
    "g": ["g", "gm", "gms", "gram", "grams"],
    "ml": ["ml", "millilitre", "milliliter"],
}
PACK_WORDS = ["drum", "drums", "barrel", "barrels", "can", "cans", "bag", "bags", "bottle", "bottles", "piece", "pieces", "pack", "packet", "packets", "carboy", "jar", "box", "container", "unit", "units", "tanker"]
PACK_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|kgs|kilo(?:gram)?s?|ltr?s?|litres?|liters?|l|ml|gm?s?|grams?)\b", re.I)


def _unit(text: str) -> str | None:
    t = (text or "").lower().strip().strip(".").split("/")[0].strip()
    for u, names in UNITS.items():
        if t in names:
            return u
    if t in PACK_WORDS or any(t.startswith(w) for w in PACK_WORDS):
        return "pack"
    return None


def _pack_size(*texts: str):
    for text in texts:
        for m in PACK_RE.finditer(text or ""):
            n = float(m.group(1))
            u = m.group(2).lower()
            if u.startswith("kg") or u.startswith("kilo"):
                return n, "kg"
            if u.startswith("ml"):
                return n / 1000, "L"
            if u.startswith("g"):
                return n / 1000, "kg"
            return n, "L"
    return None


def make_matcher(product: dict):
    inc = [re.compile(p, re.I) for p in product.get("include", [])]
    exc = [re.compile(p, re.I) for p in product.get("exclude", [])]

    def ok(title: str) -> bool:
        if not title or GLOBAL_EXCLUDE.search(title):
            return False
        return any(p.search(title) for p in inc) and not any(p.search(title) for p in exc)

    return ok


def normalise_price(item: dict, density: float | None) -> dict:
    """Adds price, unit, priceKg and flags to a raw listing."""
    flags = []
    text = item.get("priceText") or ""
    m = re.search(r"([\d][\d,]*(?:\.\d+)?)", text)
    price = float(m.group(1).replace(",", "")) if m else None
    unit_text = item.get("unitText") or ""
    if "/" in text:
        unit_text = text.split("/", 1)[1]
    unit = _unit(unit_text) if unit_text else None
    if price is not None and unit is None:
        flags.append("no-unit")
    pack = _pack_size(item.get("pack", ""), item.get("title", ""))
    price_kg = None
    if price is not None and price > 0:
        if unit == "kg":
            price_kg = price
        elif unit == "t":
            price_kg = price / 1000
        elif unit == "g":
            price_kg = price * 1000
            flags.append("lab")
        elif unit == "L":
            price_kg = price / density if density else None
            if not density:
                flags.append("per-litre")
        elif unit == "ml":
            price_kg = price * 1000 / density if density else None
            flags.append("lab")
        elif unit == "pack" and pack:
            size, su = pack
            per = price / size if size else None
            if per is not None:
                price_kg = per if su == "kg" else (per / density if density else None)
            flags.append("per-pack")
    if re.search(r"usd|us\$|\$|eur|€", text, re.I):
        flags.append("foreign-currency")  # e.g. "2-3 USD ($) (Approx.)/kg": not a rupee price
        price_kg = None
    grade_text = f"{item.get('title', '')} {item.get('grade', '')}"
    if LAB.search(grade_text):
        flags.append("lab")
    if pack and pack[0] <= 5:
        flags.append("small-pack")
    return {**item, "price": price, "unit": unit, "priceKg": round(price_kg, 2) if price_kg else None, "flags": sorted(set(flags))}


# ----------------------------------------------------------------------------- crawling

def page_url(src: str, slug: str, city: tuple | None = None) -> str:
    if src == "exportersindia":
        return city[1] if city else f"https://www.exportersindia.com/indian-suppliers/{slug}.htm"
    if src == "indiamart":
        return f"https://dir.indiamart.com/{city[1]}/{slug}.html" if city else f"https://dir.indiamart.com/impcat/{slug}.html"
    return urljoin("https://www.tradeindia.com", city[1]) if city else f"https://www.tradeindia.com/manufacturers/{slug}.html"


def parse(src: str, html: str) -> dict:
    if src == "exportersindia":
        return parse_exportersindia(html)
    return parse_indiamart(html) if src == "indiamart" else parse_tradeindia(html)


def resolve_slug(client: Polite, src: str, product: dict, store, log) -> str | None:
    key = f"slug:{src}:{product['id']}"
    candidates = product.get(SLUG_KEY[src])
    if candidates is None:  # no explicit list: try the other marketplaces' page names
        candidates = list(dict.fromkeys(product.get("ti", []) + product.get("im", [])))
    failed_marker = "!" + ",".join(candidates)
    known = store.get_state(key)
    if known and not known.startswith("!"):
        return known
    if known == failed_marker or not candidates:
        return None  # already tried exactly these page names
    for slug in candidates:
        try:
            r = client.get(page_url(src, slug))
        except PermissionError:
            continue
        if r.status_code != 200:
            continue
        data = parse(src, r.text)
        ok = make_matcher(product)
        matched = sum(1 for x in data["listings"] if ok(x["title"]))
        if matched:
            store.set_state(key, slug)
            log(f"    {product['id']}: {SOURCES[src]['label']} page '{slug}' ({data['total']} listings)")
            return slug
    store.set_state(key, failed_marker)  # retried automatically if the candidate list changes
    log(f"    {product['id']}: no {SOURCES[src]['label']} page found")
    return None


def crawl(store, products: list[dict], src: str, log, budget_s: float | None = None, force: bool = False) -> dict:
    cfg = SOURCES[src]
    paused = store.get_state(f"paused:{src}")
    now = dt.datetime.now(dt.timezone.utc)
    if paused and not force and dt.datetime.fromisoformat(paused) > now:
        log(f"  {cfg['label']} paused until {paused} (it asked us to slow down)")
        return {"new": 0, "updated": 0, "unchanged": 0, "pages": 0}

    client = Polite(cfg["delay"])
    budget = budget_s or cfg["budget"]
    t0 = time.time()
    stats = {"new": 0, "updated": 0, "unchanged": 0, "pages": 0, "dropped": 0}
    stale_before = (now - dt.timedelta(hours=REFETCH_HOURS)).isoformat()

    def build_queue():
        state = store.get_crawl(src)
        q = []
        for p in products:
            nat_key = f"{src}:{p['id']}:_all"
            q.append((state.get(nat_key, {}).get("fetchedAt") or "", 0, p, None, nat_key))
            for city in state.get(nat_key, {}).get("cities", []):
                key = f"{src}:{p['id']}:{city[1]}"
                q.append((state.get(key, {}).get("fetchedAt") or "", 1, p, tuple(city), key))
        # never-fetched first (national before city), then the oldest
        q.sort(key=lambda x: (x[0], x[1]))
        return [x for x in q if force or not x[0] or x[0] <= stale_before]

    max_pages = cfg.get("max_pages", 10_000) if not budget_s else 10_000
    done_keys: set[str] = set()
    queue = build_queue()
    while queue:
        fetched_at, _, product, city, key = queue.pop(0)
        if key in done_keys:
            continue
        done_keys.add(key)
        if time.time() - t0 > budget or stats["pages"] >= max_pages:
            log(f"  run limit reached ({stats['pages']} pages, {(time.time() - t0) / 60:.0f} min); the rest continues next run")
            break
        try:
            slug = resolve_slug(client, src, product, store, log)
            if not slug:
                continue
            url = page_url(src, slug, city)
            r = client.get(url)
        except Blocked as e:
            until = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6)).replace(microsecond=0).isoformat()
            store.set_state(f"paused:{src}", until)
            log(f"  {cfg['label']} pushed back ({e}); pausing it until {until[:16]}")
            stats["blocked"] = True
            break
        except (requests.RequestException, PermissionError) as e:
            log(f"  {key}: {e}")
            continue
        stats["pages"] += 1
        if r.status_code != 200:
            store.set_crawl(src, key, {"fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "status": r.status_code, "url": url})
            continue
        data = parse(src, r.text)
        ok = make_matcher(product)
        rows = []
        for x in data["listings"]:
            if not x["company"] or not ok(x["title"]):
                stats["dropped"] += 1
                continue
            rows.append(normalise_price(x, product.get("density")))
        res = store.save_listings(src, product, rows, page_key=key, page_city=city[0] if city else None)
        for k in ("new", "updated", "unchanged"):
            stats[k] += res[k]
        meta = {"fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "status": 200, "url": url, "n": len(rows), "total": data["total"]}
        if city is None:
            meta["cities"] = [list(c) for c in data["cities"]][:40]
        store.set_crawl(src, key, meta)
        if city is None and data["cities"]:
            # city pages just discovered: queue them in this same run
            queue += [x for x in build_queue() if x[4] not in done_keys and x[2]["id"] == product["id"]]
    log(f"  {cfg['label']}: {stats['pages']} pages, {stats['new']} new listings, {stats['updated']} price changes, {stats['unchanged']} unchanged, {stats['dropped']} unrelated skipped")
    return stats
