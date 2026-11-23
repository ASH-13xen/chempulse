/**
 * Seller analytics: every marketplace listing and brief row, matched to a product,
 * converted to Rs/kg, grouped by trading region, with outliers flagged.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getBoard } from "./board";
import { products } from "./products";
import { FOCUS_REGIONS } from "./regions";
import { getListingPrices, getListings } from "./repo";
import { companiesOf, enrich, sellerEvents, statsOf, type Listing, type ProductSummary, type SellerBoard } from "./seller-stats";

export * from "./seller-stats";

export async function getEnrichedListings(): Promise<Listing[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  const raw = await getListings();
  const latest = raw.reduce((m, l) => (l.lastSeen > m ? l.lastSeen : m), "");
  return enrich(raw, latest ? Date.parse(latest) : Date.now());
}

export async function getSellerBoard(): Promise<SellerBoard> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  const [ls, prices, board] = await Promise.all([getEnrichedListings(), getListingPrices(), getBoard()]);
  const latest = ls.reduce((m, l) => (l.lastSeen > m ? l.lastSeen : m), "");
  const now = latest ? Date.parse(latest) : Date.now();
  const active = ls.filter((l) => l.active);
  const rowsById = Object.fromEntries(board.rows.map((r) => [r.id, r]));

  const regionCount = new Map<string, number>();
  for (const l of active) regionCount.set(l.region, (regionCount.get(l.region) ?? 0) + 1);
  const regions = [...regionCount.entries()].map(([region, n]) => ({ region, n })).sort((a, b) => (FOCUS_REGIONS.indexOf(b.region) >= 0 ? 1e9 : b.n) - (FOCUS_REGIONS.indexOf(a.region) >= 0 ? 1e9 : a.n) || FOCUS_REGIONS.indexOf(a.region) - FOCUS_REGIONS.indexOf(b.region));

  const summaries: ProductSummary[] = [];
  for (const p of products) {
    const group = active.filter((l) => l.product === p.id);
    if (!group.length) continue;
    const byRegion = new Map<string, Listing[]>();
    for (const l of group) (byRegion.get(l.region) ?? byRegion.set(l.region, []).get(l.region)!).push(l);
    const regs = [...byRegion.entries()].map(([region, g]) => ({ region, stats: statsOf(g) })).sort((a, b) => b.stats.n - a.stats.n);
    const stats = statsOf(group);
    // only compare with the import price when it is a clean, single-product series
    const imp = p.chem && rowsById[p.chem]?.rankable ? rowsById[p.chem]?.imports : null;
    const ch = regs.find((r) => r.region === "Chennai")?.stats.median ?? null;
    const mu = regs.find((r) => r.region === "Mumbai")?.stats.median ?? null;
    summaries.push({
      id: p.id,
      name: p.name,
      chem: p.chem,
      category: p.category,
      stats,
      regions: regs,
      importPrice: imp?.price ?? null,
      importMonth: imp?.month ?? null,
      markup: stats.median != null && imp?.price ? (stats.median / imp.price - 1) * 100 : null,
      chennaiVsMumbai: ch != null && mu != null ? (ch / mu - 1) * 100 : null,
      companies: new Set(group.map((l) => l.companyKey)).size,
    });
  }

  const bySource: Record<string, number> = {};
  for (const l of ls) bySource[l.src] = (bySource[l.src] ?? 0) + 1;
  const viaBrief = ls.filter((l) => l.via === "brief").length;
  const companies = companiesOf(active);
  return {
    products: summaries,
    companies,
    events: sellerEvents(ls, prices, now),
    regions,
    totals: { listings: ls.length, active: active.length, companies: companies.length, priced: active.filter((l) => l.credible).length, bySource, viaBrief },
    lastSeen: latest || null,
  };
}

