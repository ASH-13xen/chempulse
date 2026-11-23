/**
 * Pure seller calculations (no database access) so they can run in the browser too.
 */
import { productById } from "./products";
import { regionOf } from "./regions";
import type { ListingPrice, RawListing } from "./repo";

const DAY = 86_400_000;

export type Listing = RawListing & {
  region: string;
  active: boolean; // seen in the last 30 days (brief rows: within 45 days of the brief)
  credible: boolean; // has Rs/kg, not lab/small pack, not an outlier, not a repeat of the same seller
  duplicate: boolean; // same seller, product and region already counted once
  outlier: "high" | "low" | null;
};

export type Stats = {
  n: number;
  priced: number;
  credible: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  manufacturers: number;
  traders: number;
};

export type RegionStats = { region: string; stats: Stats };

export type ProductSummary = {
  id: string;
  name: string;
  chem: string | null;
  category: string;
  stats: Stats;
  regions: RegionStats[];
  importPrice: number | null;
  importMonth: string | null;
  markup: number | null; // median ask vs India import price, %
  chennaiVsMumbai: number | null; // % (Chennai median / Mumbai median - 1)
  companies: number;
};

export type Company = {
  key: string;
  name: string;
  cities: string[];
  regions: string[];
  products: string[];
  categories: string[];
  types: { manufacturer: boolean; trader: boolean; distributor: boolean; exporter: boolean };
  sources: string[];
  listings: number;
  priced: number;
  gstVerified: boolean;
  memberYears: number | null;
  rating: number | null;
  ratings: number | null;
  firstSeen: string;
  lastSeen: string;
};

export type SellerEvent = {
  id: string;
  type: "new" | "price-up" | "price-down";
  d: string;
  product: string;
  company: string;
  companyKey: string;
  region: string;
  text: string;
  pct?: number;
};

export type SellerBoard = {
  products: ProductSummary[];
  companies: Company[];
  events: SellerEvent[];
  regions: { region: string; n: number }[];
  totals: { listings: number; active: number; companies: number; priced: number; bySource: Record<string, number>; viaBrief: number };
  lastSeen: string | null;
};

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function statsOf(ls: Listing[]): Stats {
  const vals = ls.filter((l) => l.credible).map((l) => l.priceKg!).sort((a, b) => a - b);
  return {
    n: ls.length,
    priced: ls.filter((l) => l.priceKg != null).length,
    credible: vals.length,
    median: quantile(vals, 0.5),
    p25: quantile(vals, 0.25),
    p75: quantile(vals, 0.75),
    min: vals[0] ?? null,
    max: vals.at(-1) ?? null,
    manufacturers: ls.filter((l) => l.types?.manufacturer).length,
    traders: ls.filter((l) => l.types?.trader || l.types?.distributor || l.flags.includes("trader-likely")).length,
  };
}

function titleCase(name: string) {
  if (name.length > 4 && name === name.toUpperCase()) {
    return name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llp|Pvt|Ltd|Opc|Ii|Iii)\b/g, (w) => (w === "Pvt" || w === "Ltd" ? w : w.toUpperCase()));
  }
  return name;
}

/** Adds region, activity, and outlier flags. Outliers: over 3x or under 1/3 of the product median. */
export function enrich(raw: RawListing[], now = Date.now()): Listing[] {
  const ls: Listing[] = raw.map((l) => {
    const ageDays = l.lastSeen ? (now - Date.parse(l.lastSeen)) / DAY : 999;
    const active = l.via === "brief" ? ageDays < 45 : ageDays < 30;
    return { ...l, company: titleCase(l.company), region: regionOf(l.city), active, credible: false, duplicate: false, outlier: null };
  });
  const byProduct = new Map<string, Listing[]>();
  for (const l of ls) (byProduct.get(l.product) ?? byProduct.set(l.product, []).get(l.product)!).push(l);
  for (const group of byProduct.values()) {
    const base = group.filter((l) => l.active && l.priceKg != null && l.priceKg > 0 && !l.flags.some((f) => f === "lab" || f === "small-pack" || f === "outlier"));
    const med = quantile(base.map((l) => l.priceKg!).sort((a, b) => a - b), 0.5);
    for (const l of group) {
      if (l.priceKg == null || med == null) continue;
      if (l.priceKg > med * 3) l.outlier = "high";
      else if (l.priceKg < med / 3) l.outlier = "low";
      l.credible = base.includes(l) && !l.outlier;
    }
  }
  // Count each seller once per product and region: keep its most recently seen
  // (then most recent price) listing; the rest stay visible but are not counted.
  const seen = new Map<string, Listing>();
  const order = [...ls].filter((l) => l.credible).sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : b.lastSeen < a.lastSeen ? -1 : b.changedAt > a.changedAt ? 1 : -1));
  for (const l of order) {
    const key = `${l.product}|${l.companyKey}|${l.region}`;
    if (seen.has(key)) {
      l.credible = false;
      l.duplicate = true;
    } else seen.set(key, l);
  }
  return ls;
}

export function companiesOf(ls: Listing[]): Company[] {
  const map = new Map<string, Listing[]>();
  for (const l of ls) (map.get(l.companyKey) ?? map.set(l.companyKey, []).get(l.companyKey)!).push(l);
  const out: Company[] = [];
  for (const [key, group] of map) {
    const names = new Map<string, number>();
    for (const l of group) names.set(l.company, (names.get(l.company) ?? 0) + 1);
    const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const uniq = <T,>(a: T[]) => [...new Set(a.filter(Boolean))];
    const ratings = group.filter((l) => l.rating);
    out.push({
      key,
      name,
      cities: uniq(group.map((l) => l.city)),
      regions: uniq(group.map((l) => l.region)),
      products: uniq(group.map((l) => l.product)),
      categories: uniq(group.map((l) => l.category)),
      types: {
        manufacturer: group.some((l) => l.types?.manufacturer || l.flags.includes("manufacturer-claimed")),
        trader: group.some((l) => l.types?.trader || l.flags.includes("trader-likely")),
        distributor: group.some((l) => l.types?.distributor),
        exporter: group.some((l) => l.types?.exporter),
      },
      sources: uniq(group.map((l) => l.src)),
      listings: group.length,
      priced: group.filter((l) => l.priceKg != null).length,
      gstVerified: group.some((l) => l.gstVerified),
      memberYears: Math.max(0, ...group.map((l) => l.memberYears ?? 0)) || null,
      rating: ratings.length ? ratings.reduce((a, l) => a + (l.rating ?? 0), 0) / ratings.length : null,
      ratings: ratings.length ? ratings.reduce((a, l) => a + (l.ratings ?? 0), 0) : null,
      firstSeen: group.map((l) => l.firstSeen).sort()[0] ?? "",
      lastSeen: group.map((l) => l.lastSeen).sort().at(-1) ?? "",
    });
  }
  return out.sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}

/** New sellers (after the first crawl settled) and price changes, last 14 days. */
export function sellerEvents(ls: Listing[], prices: ListingPrice[], now = Date.now()): SellerEvent[] {
  const events: SellerEvent[] = [];
  const firstBySrc = new Map<string, number>();
  for (const l of ls) {
    const t = Date.parse(l.firstSeen);
    if (!firstBySrc.has(l.src) || t < firstBySrc.get(l.src)!) firstBySrc.set(l.src, t);
  }
  const byId = new Map(ls.map((l) => [l.id, l]));
  for (const l of ls) {
    if (l.via === "brief") continue;
    const t = Date.parse(l.firstSeen);
    if (t > (firstBySrc.get(l.src) ?? 0) + 2 * DAY && now - t < 14 * DAY) {
      events.push({ id: `new:${l.id}`, type: "new", d: l.firstSeen.slice(0, 10), product: l.product, company: l.company, companyKey: l.companyKey, region: l.region, text: `New seller: ${l.company} (${l.region}) lists ${productById[l.product]?.name ?? l.product}${l.priceKg ? ` at ₹${l.priceKg.toFixed(0)}/kg` : ""}.` });
    }
  }
  const hist = new Map<string, ListingPrice[]>();
  for (const p of prices) (hist.get(p.l) ?? hist.set(p.l, []).get(p.l)!).push(p);
  for (const [id, h] of hist) {
    if (h.length < 2) continue;
    const last = h[h.length - 1];
    const prev = h[h.length - 2];
    if (now - Date.parse(last.d) > 14 * DAY) continue;
    const a = prev.priceKg ?? prev.price;
    const b = last.priceKg ?? last.price;
    if (!a || !b || a === b) continue;
    const pct = (b / a - 1) * 100;
    const l = byId.get(id);
    if (!l || Math.abs(pct) < 1) continue;
    events.push({
      id: `chg:${id}:${last.d}`,
      type: pct > 0 ? "price-up" : "price-down",
      d: last.d,
      product: l.product,
      company: l.company,
      companyKey: l.companyKey,
      region: l.region,
      pct,
      text: `${l.company} (${l.region}) ${pct > 0 ? "raised" : "cut"} ${productById[l.product]?.name ?? l.product} ${pct > 0 ? "to" : "to"} ₹${(b).toFixed(0)}${last.priceKg ? "/kg" : ""} (${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%).`,
    });
  }
  return events.sort((x, y) => (x.d < y.d ? 1 : -1));
}

/** Median asking price per day for a product, overall and per focus region (carry-forward each listing's latest price). */
export function askHistory(ls: Listing[], prices: ListingPrice[], productId: string) {
  const ids = new Map(ls.filter((l) => l.product === productId && !l.flags.includes("lab") && !l.flags.includes("small-pack")).map((l) => [l.id, l]));
  const hist = prices.filter((p) => ids.has(p.l) && p.priceKg != null).sort((a, b) => (a.d < b.d ? -1 : 1));
  const days = [...new Set(hist.map((h) => h.d))].sort();
  const latest = new Map<string, number>();
  const out: { d: string; all: number | null; Chennai: number | null; Mumbai: number | null }[] = [];
  let i = 0;
  for (const d of days) {
    while (i < hist.length && hist[i].d <= d) {
      latest.set(hist[i].l, hist[i].priceKg!);
      i++;
    }
    const med = (region?: string) => {
      const vals = [...latest.entries()].filter(([id]) => !region || ids.get(id)?.region === region).map(([, v]) => v).sort((a, b) => a - b);
      const m = quantile(vals, 0.5);
      if (m == null) return null;
      const kept = vals.filter((v) => v <= m * 3 && v >= m / 3);
      return quantile(kept, 0.5);
    };
    out.push({ d, all: med(), Chennai: med("Chennai"), Mumbai: med("Mumbai") });
  }
  return out;
}
