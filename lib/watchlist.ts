/**
 * Server side of the watchlist: reads the saved items and gathers everything the
 * Watchlist page shows, grouped by chemical category.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getBoard } from "./board";
import { categories, chemicalById, marketById } from "./catalog";
import { getDb, hasMongo } from "./db";
import { productById } from "./products";
import type { Company, Listing, ProductSummary } from "./seller-stats";
import { getEnrichedListings, getSellerBoard } from "./sellers";
import type { Row } from "./types";

export type WatchKind = "chem" | "market" | "product" | "supplier";
export type SavedItem = { t: WatchKind; id: string; addedAt: string };

export async function getWatchlist(): Promise<SavedItem[]> {
  "use cache";
  cacheLife("market");
  cacheTag("watchlist");
  if (!hasMongo()) return [];
  const doc = await (await getDb()).collection<{ _id: string; items: SavedItem[] }>("watchlist").findOne({ _id: "default" });
  return doc?.items ?? [];
}

export type WatchSection = {
  id: string;
  name: string;
  slot: number | null;
  chems: Row[];
  markets: Row[];
  products: ProductSummary[];
  suppliers: { company: Company; listings: Listing[] }[];
};

export type WatchView = {
  items: SavedItem[];
  sections: WatchSection[];
  missing: SavedItem[]; // saved items with no data right now (e.g. a supplier not seen lately)
  pickers: {
    chems: { id: string; name: string; category: string }[];
    markets: { id: string; name: string; group: string }[];
    products: { id: string; name: string; category: string }[];
    suppliers: { id: string; name: string; where: string }[];
  };
  medians: Record<string, number | null>;
  storage: "mongo" | "json";
};

export async function getWatchView(): Promise<WatchView> {
  const [items, board, sb, listings] = await Promise.all([getWatchlist(), getBoard(), getSellerBoard(), getEnrichedListings()]);
  const rows = Object.fromEntries(board.rows.map((r) => [r.id, r]));
  const companies = Object.fromEntries(sb.companies.map((c) => [c.key, c]));
  const sections = new Map<string, WatchSection>();
  const sec = (id: string) => {
    if (!sections.has(id)) {
      const c = categories.find((x) => x.id === id);
      sections.set(id, { id, name: c?.name ?? "Markets & drivers", slot: c?.slot ?? null, chems: [], markets: [], products: [], suppliers: [] });
    }
    return sections.get(id)!;
  };
  const missing: SavedItem[] = [];
  for (const it of items) {
    if (it.t === "chem" && rows[it.id] && chemicalById[it.id]) sec(chemicalById[it.id].category).chems.push(rows[it.id]);
    else if (it.t === "market" && rows[it.id]) sec("markets").markets.push(rows[it.id]);
    else if (it.t === "product" && productById[it.id]) {
      const p = sb.products.find((x) => x.id === it.id);
      if (p) sec(p.category).products.push(p);
      else missing.push(it);
    } else if (it.t === "supplier") {
      const c = companies[it.id];
      const mine = listings.filter((l) => l.companyKey === it.id && l.active);
      if (!c || !mine.length) {
        missing.push(it);
        continue;
      }
      for (const cat of [...new Set(mine.map((l) => l.category))]) sec(cat).suppliers.push({ company: c, listings: mine.filter((l) => l.category === cat) });
    } else missing.push(it);
  }
  const order = [...categories.map((c) => c.id), "markets"];
  return {
    items,
    sections: [...sections.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    missing,
    pickers: {
      chems: board.rows.filter((r) => r.type === "chemical").map((r) => ({ id: r.id, name: r.name, category: r.category! })),
      markets: board.rows.filter((r) => r.type === "market").map((r) => ({ id: r.id, name: r.name, group: marketById[r.id]?.group ?? "" })),
      products: sb.products.map((p) => ({ id: p.id, name: p.name, category: p.category })),
      suppliers: sb.companies.map((c) => ({ id: c.key, name: c.name, where: c.regions.slice(0, 3).join(", ") })),
    },
    medians: Object.fromEntries(sb.products.map((p) => [p.id, p.stats.median])),
    storage: hasMongo() ? "mongo" : "json",
  };
}
