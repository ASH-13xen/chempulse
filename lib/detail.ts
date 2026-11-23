/**
 * Everything the chemical / market page needs, computed on the server and cached.
 */
import { cacheLife, cacheTag } from "next/cache";
import {
  addMonths,
  clean,
  correlation,
  detectEvents,
  filterImportOutliers,
  maxDrawdown,
  MONTH_NAMES,
  periodReturns,
  seasonality,
  type VP,
} from "./analytics";
import { getBoard } from "./board";
import { chemicalById, chemicals, importSeriesId, marketById, seriesInfo } from "./catalog";
import { fmtDate, fmtPct, fmtPrice, fmtTonnes } from "./format";
import { getManyPoints, getNews, getOrigins, type OriginsByMonth } from "./repo";
import type { NewsItem, Point, Row } from "./types";

export type DriverLink = { id: string; name: string; r: number | null; n: number; basis: "weekly" | "monthly" };

export type Detail = {
  kind: "chemical" | "market";
  id: string;
  row: Row;
  primary: Point[];
  imports: Point[]; // outlier-filtered (price blank for tiny months)
  importsRaw: Point[];
  drivers: { id: string; name: string; short: string; unit: string; points: { d: string; v: number }[] }[];
  driverLinks: DriverLink[];
  fx: { d: string; v: number }[]; // CNY→INR, for ₹/kg conversion
  fxUsd: { d: string; v: number }[]; // USD→INR
  origins: OriginsByMonth;
  news: NewsItem[];
  markers: { d: string; type: string; label: string }[];
  seasonal: ReturnType<typeof seasonality>;
  drawdown1y: number | null;
  insights: string[];
  usedBy: { id: string; name: string }[]; // markets: chemicals that use this as a driver
};

const SINCE = "2016-01-01";

export function prettyCountry(c: string) {
  const map: Record<string, string> = {
    "China P Rp": "China",
    "Korea Rp": "South Korea",
    "U Arab Emts": "UAE",
    "U S A": "USA",
    "Saudi Arab": "Saudi Arabia",
    "Russia": "Russia",
    "U K": "UK",
    "Iran": "Iran",
    "Netherland": "Netherlands",
    "Taiwan": "Taiwan",
  };
  return map[c] ?? c;
}

export async function getDetail(id: string): Promise<Detail | null> {
  "use cache";
  cacheLife("market");
  cacheTag("market");

  const chem = chemicalById[id];
  const market = marketById[id];
  if (!chem && !market) return null;
  const board = await getBoard();
  const row = board.rows.find((r) => r.id === id)!;

  const primaryId = chem ? (chem.daily ?? importSeriesId(chem.id)) : id;
  const driverIds = chem ? chem.drivers : [];
  const ids = [...new Set([primaryId, ...(chem ? [importSeriesId(chem.id)] : []), ...driverIds, "cnyinr", "usdinr"])];
  const all = await getManyPoints(ids, SINCE);

  const importsRaw = chem ? (all[importSeriesId(chem.id)] ?? []) : [];
  const imports = filterImportOutliers(importsRaw);
  const primary = chem && !chem.daily ? imports : (all[primaryId] ?? []);
  const s = clean(primary);
  const freq = row.frequency;

  // drivers & how closely the chemical follows them
  const basis = freq === "daily" ? "weekly" : "monthly";
  const period = freq === "daily" ? "week" : "month";
  const from3y = s.length ? addMonths(s[s.length - 1].d, -36) : SINCE;
  const pr = periodReturns(s.filter((p) => p.d >= from3y), period);
  const drivers = driverIds.map((did) => {
    const info = seriesInfo[did];
    return { id: did, name: info.name, short: info.short, unit: info.unit, points: clean(all[did] ?? []) };
  });
  const driverLinks: DriverLink[] = drivers.map((d) => {
    const c = correlation(pr, periodReturns(d.points.filter((p) => p.d >= from3y), period), freq === "daily" ? 26 : 12);
    return { id: d.id, name: d.name, r: c.r, n: c.n, basis };
  });
  // for daily chemicals: does India's import price follow the China price?
  const impClean = clean(imports);
  if (chem?.daily && impClean.length > 12) {
    const c = correlation(periodReturns(s.filter((p) => p.d >= from3y), "month"), periodReturns(impClean.filter((p) => p.d >= from3y), "month"), 12);
    driverLinks.push({ id: importSeriesId(chem.id), name: "India import price (monthly)", r: c.r, n: c.n, basis: "monthly" });
  }

  const events = detectEvents(s, freq, 365);
  const markers = events.map((e) => ({
    d: e.d,
    type: e.type,
    label: e.type === "cross-up" ? "Trend ↑" : e.type === "cross-down" ? "Trend ↓" : e.type === "high" ? "High" : e.type === "low" ? "Low" : e.type === "jump" ? "Jump" : "Drop",
  }));

  const seasonal = seasonality(s);
  const last = s.at(-1);
  const yearAgo = last ? addMonths(last.d, -12) : SINCE;
  const drawdown1y = s.length ? maxDrawdown(s.filter((p) => p.d >= yearAgo)) : null;

  const origins = chem ? ((await getOrigins())[chem.id] ?? []) : [];
  const news = chem ? (await getNews(600)).filter((n) => n.chem === chem.id).slice(0, 12) : [];

  // plain-English insights
  const insights: string[] = [];
  const unitLabel = (v: number | null) => fmtPrice(v, row.unit);
  if (row.trend.dir !== "flat" && row.trend.since) {
    insights.push(
      `In ${row.trend.dir === "up" ? "an uptrend" : "a downtrend"} since ${fmtDate(row.trend.since, freq === "monthly" ? "month" : "long")} (${freq === "daily" ? "20-day average " + (row.trend.dir === "up" ? "above" : "below") + " the 50-day" : "3-month average " + (row.trend.dir === "up" ? "above" : "below") + " the 12-month"}).`,
    );
  } else if (row.trend.dir === "flat") insights.push("Moving sideways: the short- and long-term averages are close together.");
  if (row.rangePos != null) {
    const p = Math.round(row.rangePos * 100);
    insights.push(`Sits at ${p}% of its ${freq === "daily" ? "52-week" : "12-month"} range (low ${unitLabel(row.lo52)}, high ${unitLabel(row.hi52)}).${p >= 90 ? " Close to the top." : p <= 10 ? " Close to the bottom." : ""}`);
  }
  if (row.typicalMove != null) {
    const per = freq === "daily" ? "day" : "month";
    const ch = freq === "daily" ? row.changes.m1 : row.changes.m1;
    const scale = freq === "daily" ? row.typicalMove * Math.sqrt(21) : row.typicalMove;
    const size = ch == null ? null : Math.abs(ch) > 2 * scale ? "an unusually large move" : Math.abs(ch) > scale ? "a bigger-than-usual move" : "a normal-sized move";
    insights.push(`Typically moves about ±${row.typicalMove.toFixed(1)}% a ${per}.${ch != null ? ` Over the last month it changed ${fmtPct(ch)}, ${size}.` : ""}`);
  }
  if (last) {
    const m = Number(last.d.slice(5, 7)); // current calendar month (1-12)
    const next = seasonal[m % 12];
    if (next.avg != null && next.n >= 3) {
      insights.push(`Past pattern: ${next.month} has been ${Math.abs(next.avg) < 0.5 ? "a mostly flat" : next.avg > 0 ? "a rising" : "a falling"} month (up in ${next.up} of ${next.n} years, average ${fmtPct(next.avg)}). Patterns can break.`);
    }
  }
  const strongest = driverLinks.filter((l) => l.r != null && !l.id.startsWith("imp-")).sort((a, b) => Math.abs(b.r!) - Math.abs(a.r!))[0];
  if (strongest && Math.abs(strongest.r!) >= 0.35) insights.push(`Moves most closely with ${strongest.name} (correlation ${strongest.r!.toFixed(2)} on ${strongest.basis} changes, last 3 years).`);
  if (row.imports) {
    const imp = row.imports;
    insights.push(
      `India imported ${fmtTonnes(imp.qtyT)} in ${fmtDate(imp.month, "month")}${imp.qtyYoY != null ? ` (${fmtPct(imp.qtyYoY, 0)} vs a year earlier)` : ""}${imp.price != null ? ` at an average ₹${imp.price.toFixed(1)}/kg${imp.priceMoM != null ? ` (${fmtPct(imp.priceMoM)} vs previous month)` : ""}` : ""}.`,
    );
  }
  const o = origins[0];
  if (o && o.rows.length) {
    const tot = o.rows.reduce((a, r) => a + r.qYtd, 0);
    const top = o.rows.slice(0, 2).filter((r) => r.qYtd > 0);
    if (tot > 0 && top.length) insights.push(`Main suppliers this financial year: ${top.map((r) => `${prettyCountry(r.country)} ${Math.round((r.qYtd / tot) * 100)}%`).join(", ")}.`);
  }

  const usedBy = market ? chemicals.filter((c) => c.drivers.includes(id) || c.daily === id).map((c) => ({ id: c.id, name: c.name })) : [];

  return {
    kind: chem ? "chemical" : "market",
    id,
    row,
    primary,
    imports,
    importsRaw,
    drivers,
    driverLinks,
    fx: clean(all["cnyinr"] ?? []),
    fxUsd: clean(all["usdinr"] ?? []),
    origins,
    news,
    markers,
    seasonal,
    drawdown1y,
    insights,
    usedBy,
  };
}

export { MONTH_NAMES };
export type { VP };
