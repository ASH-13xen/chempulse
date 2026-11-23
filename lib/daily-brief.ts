/**
 * The daily brief, generated from the site's own data with fixed rules
 * (no AI service). Same shape as the market brief the client used to receive.
 */
import { cacheLife, cacheTag } from "next/cache";
import { addMonths, clean, monthKey } from "./analytics";
import { getBoard } from "./board";
import { categories, categoryById, chemicals, marketById } from "./catalog";
import { fmtDate, fmtPct } from "./format";
import { productById, products } from "./products";
import { getNews, getPoints } from "./repo";
import { getEnrichedListings, getSellerBoard, type Listing } from "./sellers";
import type { NewsItem, Row } from "./types";

export type BriefRow = { id: string; company: string; companyKey: string; product: string; productName: string; title: string; priceText: string; priceKg: number | null; flags: string[]; outlier: string | null; src: string; via?: string; url: string };
export type BriefSection = {
  category: string;
  name: string;
  lines: string[];
  tables: { region: string; rows: BriefRow[] }[];
  context: NewsItem[];
  regulatory: NewsItem[];
  outlook: { direction: "firm" | "stable" | "soft"; confidence: "low" | "medium"; text: string; evidence: string[]; changeOn: string[] };
};
export type DailyBrief = {
  asOf: string;
  quality: string[];
  top: { title: string; text: string; href: string }[];
  sections: BriefSection[];
  imports: { month: string; crore: number; usdBn: number | null; prevCrore: number | null; lyCrore: number | null } | null;
};

const r0 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

function toRow(l: Listing): BriefRow {
  return { id: l.id, company: l.company, companyKey: l.companyKey, product: l.product, productName: productById[l.product]?.name ?? l.product, title: l.title, priceText: l.priceText, priceKg: l.priceKg, flags: l.flags, outlier: l.outlier, src: l.src, via: l.via, url: l.url };
}

function outlookFor(catId: string, rows: Row[], drivers: Record<string, Row | undefined>) {
  const evidence: string[] = [];
  let score = 0;
  let weight = 0;
  for (const r of rows.filter((x) => x.category === catId && x.rankable)) {
    if (r.frequency === "daily") {
      const t = r.trend.dir === "up" ? 1 : r.trend.dir === "down" ? -1 : 0;
      const m = r.changes.m1 ?? 0;
      score += t + (m > 3 ? 0.5 : m < -3 ? -0.5 : 0);
      weight += 1.5;
      evidence.push(`${r.name}: China futures ${fmtPct(r.changes.m1)} this month${t ? `, ${t > 0 ? "uptrend" : "downtrend"}` : ""}`);
    } else if (r.imports?.priceMoM != null && Math.abs(r.imports.priceMoM) >= 3) {
      score += r.imports.priceMoM > 0 ? 0.5 : -0.5;
      weight += 0.75;
      evidence.push(`${r.name}: India import price ${fmtPct(r.imports.priceMoM)} m/m (${fmtDate(r.imports.month, "month")})`);
    }
  }
  const petro = ["solvents", "polymers", "building-blocks", "specialty"].includes(catId);
  const brent = drivers.brent;
  if (petro && brent?.changes.m1 != null && Math.abs(brent.changes.m1) > 5) {
    score += brent.changes.m1 > 0 ? 0.4 : -0.4;
    weight += 0.5;
    evidence.push(`Brent crude ${fmtPct(brent.changes.m1)} this month`);
  }
  const inr = drivers.usdinr;
  if (inr?.changes.m1 != null && Math.abs(inr.changes.m1) > 1) {
    score += inr.changes.m1 > 0 ? 0.3 : -0.3;
    weight += 0.4;
    evidence.push(`Rupee ${inr.changes.m1 > 0 ? "weaker" : "stronger"} vs the dollar (${fmtPct(inr.changes.m1)} this month)`);
  }
  const s = weight ? score / weight : 0;
  const direction = s > 0.25 ? "firm" : s < -0.25 ? "soft" : "stable";
  const confidence = Math.abs(s) > 0.5 && evidence.length >= 3 ? "medium" : "low";
  const text =
    direction === "firm"
      ? "Local asking prices are more likely to firm up than ease over the next 1–4 weeks."
      : direction === "soft"
        ? "Local asking prices are more likely to ease than firm up over the next 1–4 weeks."
        : "Local asking prices look likely to stay broadly stable over the next 1–4 weeks.";
  const driverNames = new Set<string>();
  for (const c of chemicals.filter((c) => c.category === catId)) for (const d of c.drivers) driverNames.add(marketById[d]?.name ?? d);
  const changeOn = [...[...driverNames].slice(0, 3).map((d) => `a sharp move in ${d}`), "a big rupee move", "a new duty, DGTR finding or plant outage"];
  return { direction, confidence, text, evidence: evidence.slice(0, 5), changeOn } as BriefSection["outlook"];
}

export async function getDailyBrief(): Promise<DailyBrief> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  const [board, sb, listings, news, totals, usd] = await Promise.all([getBoard(), getSellerBoard(), getEnrichedListings(), getNews(600), getPoints("in-total-imports"), getPoints("usdinr")]);
  const rows = board.rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const active = listings.filter((l) => l.active);
  const asOf = [board.asOf, sb.lastSeen?.slice(0, 10)].filter(Boolean).sort().at(-1) ?? "";

  // ---------------- sections
  const sections: BriefSection[] = [];
  for (const c of categories) {
    const prods = products.filter((p) => p.category === c.id);
    const lines: string[] = [];
    for (const p of prods) {
      const sum = sb.products.find((x) => x.id === p.id);
      if (!sum || !sum.stats.credible) continue;
      const parts = ["Chennai", "Mumbai"]
        .map((reg) => {
          const s = sum.regions.find((x) => x.region === reg)?.stats;
          if (!s || !s.credible) return null;
          return `${reg} ${s.min === s.max ? r0(s.min!) : `${r0(s.min!)}–${r0(s.max!).slice(1)}`}/kg (median ${r0(s.median!)}, ${s.credible} seller${s.credible > 1 ? "s" : ""})`;
        })
        .filter(Boolean);
      lines.push(`${p.name}: ${parts.length ? parts.join("; ") + ". " : ""}All-India median ${r0(sum.stats.median!)}/kg across ${sum.stats.credible} priced sellers${sum.markup != null ? `, ${fmtPct(sum.markup, 0)} vs India's import price` : ""}.`);
    }
    const tables = ["Chennai", "Mumbai"].map((region) => {
      const picked: BriefRow[] = [];
      for (const p of prods) {
        const ls = active.filter((l) => l.product === p.id && l.region === region && l.priceKg != null && !l.duplicate).sort((a, b) => Number(b.credible) - Number(a.credible) || a.priceKg! - b.priceKg!);
        picked.push(...ls.slice(0, 4).map(toRow));
      }
      return { region, rows: picked.slice(0, 14) };
    });
    const chemIds = new Set(chemicals.filter((x) => x.category === c.id).map((x) => x.id));
    const context = news.filter((n) => n.kind !== "regulatory" && chemIds.has(n.chem)).slice(0, 3);
    const regulatory = news.filter((n) => n.kind === "regulatory" && (n.category === c.id || chemIds.has(n.chem))).slice(0, 3);
    sections.push({ category: c.id, name: c.name, lines, tables, context, regulatory, outlook: outlookFor(c.id, rows, { brent: byId.brent, usdinr: byId.usdinr }) });
  }

  // ---------------- top 5
  const top: DailyBrief["top"] = [];
  const weekAgo = asOf ? new Date(Date.parse(asOf) - 7 * 86400000).toISOString().slice(0, 10) : "";
  const moves = board.events.filter((e) => (e.type === "jump" || e.type === "drop") && e.d >= weekAgo && byId[e.rowId]?.type === "chemical").sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  if (moves[0]) top.push({ title: `${categoryById[byId[moves[0].rowId].category!].name}: ${moves[0].name}`, text: moves[0].text, href: `/chemical/${moves[0].rowId}` });
  const gaps = sb.products.filter((p) => p.chennaiVsMumbai != null && (p.regions.find((r) => r.region === "Chennai")?.stats.credible ?? 0) >= 2 && (p.regions.find((r) => r.region === "Mumbai")?.stats.credible ?? 0) >= 2).sort((a, b) => Math.abs(b.chennaiVsMumbai!) - Math.abs(a.chennaiVsMumbai!));
  if (gaps[0]) {
    const g = gaps[0];
    top.push({ title: `City gap: ${g.name}`, text: `Chennai asks run ${fmtPct(Math.abs(g.chennaiVsMumbai!), 0).replace(/^[+−]/, "")} ${g.chennaiVsMumbai! > 0 ? "above" : "below"} Mumbai (median ${r0(g.regions.find((r) => r.region === "Chennai")!.stats.median!)} vs ${r0(g.regions.find((r) => r.region === "Mumbai")!.stats.median!)}/kg).`, href: `/products/${g.id}` });
  }
  const imp = board.events.find((e) => e.type === "import-surge" || e.type === "import-slump");
  if (imp) top.push({ title: `Imports: ${imp.name}`, text: imp.text, href: `/chemical/${imp.rowId}` });
  const reg = news.find((n) => n.kind === "regulatory");
  if (reg) top.push({ title: `Regulatory: ${chemicals.find((c) => c.id === reg.chem)?.name ?? "chemicals"}`, text: `${reg.title} (${reg.source}, ${fmtDate(reg.published.slice(0, 10))}).`, href: reg.link });
  const markups = sb.products.filter((p) => p.markup != null && p.stats.credible >= 5).sort((a, b) => b.markup! - a.markup!);
  if (markups[0]) top.push({ title: `Price gap: ${markups[0].name}`, text: `Typical asking price ${r0(markups[0].stats.median!)}/kg is ${fmtPct(markups[0].markup!, 0)} above India's average import price (${r0(markups[0].importPrice!)}/kg, ${fmtDate(markups[0].importMonth, "month")}). Room to negotiate or import directly.`, href: `/products/${markups[0].id}` });
  const turns = board.events.filter((e) => (e.type === "cross-up" || e.type === "cross-down") && e.d >= weekAgo && byId[e.rowId]?.type === "chemical");
  for (const t of turns) if (top.length < 5) top.push({ title: `Trend: ${t.name}`, text: t.text, href: `/chemical/${t.rowId}` });
  for (const e of sb.events.filter((x) => x.type !== "new").slice(0, 2)) if (top.length < 5) top.push({ title: `Seller price change: ${productById[e.product]?.name ?? e.product}`, text: e.text, href: `/products/${e.product}` });

  // ---------------- imports snapshot
  const tot = clean(totals);
  let imports: DailyBrief["imports"] = null;
  if (tot.length) {
    const last = tot[tot.length - 1];
    const m = monthKey(last.d);
    const usdMonth = clean(usd).filter((p) => monthKey(p.d) === m);
    const rate = usdMonth.length ? usdMonth.reduce((a, p) => a + p.v, 0) / usdMonth.length : null;
    imports = {
      month: last.d,
      crore: last.v,
      usdBn: rate ? (last.v * 1e7) / rate / 1e9 : null,
      prevCrore: tot.find((p) => monthKey(p.d) === monthKey(addMonths(last.d, -1)))?.v ?? null,
      lyCrore: tot.find((p) => monthKey(p.d) === monthKey(addMonths(last.d, -12)))?.v ?? null,
    };
  }

  // ---------------- data quality
  const bySrc = sb.totals.bySource;
  const flagged = active.filter((l) => l.outlier || l.flags.includes("lab") || l.flags.includes("small-pack")).length;
  const quality = [
    `Seller prices are asking prices from marketplace listings: IndiaMART ${bySrc.indiamart ?? 0} (including ${sb.totals.viaBrief} from imported briefs), TradeIndia ${bySrc.tradeindia ?? 0} and ExportersIndia ${bySrc.exportersindia ?? 0}. They can be stale, teaser rates or trader prices; check with the seller before costing. Each seller counts once per product and city.`,
    `${sb.totals.priced} listings have a usable ₹/kg price. ${flagged} lab packs, small packs or extreme prices (over 3× or under ⅓ of the median) are shown but left out of medians.`,
    "Litre prices are converted to kg with each chemical's density; prices per drum or bag use the stated pack size. GST basis is usually not stated.",
    "China futures and India import prices come from the exchanges and the Department of Commerce; outlooks below are rule-based readings of those numbers, not advice.",
  ];

  return { asOf, quality, top: top.slice(0, 5), sections, imports };
}
