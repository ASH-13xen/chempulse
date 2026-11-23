/**
 * Builds the "board": one summary row per chemical and per market, plus the
 * signal feed. Used by the dashboard, screener, heatmap, alerts and imports pages.
 */
import { cacheLife, cacheTag } from "next/cache";
import {
  addDays,
  addMonths,
  clean,
  detectEvents,
  filterImportOutliers,
  momentum,
  monthKey,
  pct,
  periodChanges,
  range52,
  sparkline,
  trend,
  typicalMove,
  unusualMove,
  type VP,
} from "./analytics";
import { chemicals, importSeriesId, markets, seriesInfo } from "./catalog";
import { fmtDate, fmtPct, fmtPrice, fmtTonnes } from "./format";
import { getManyPoints, getRuns, getSeriesStatus, storageMode } from "./repo";
import type { Board, Frequency, ImportSnap, Point, Row, Run, SignalEvent } from "./types";

export function importSnapshot(raw: Point[]): ImportSnap | null {
  const withQty = raw.filter((p) => p.q != null);
  if (!withQty.length) return null;
  const last = withQty[withQty.length - 1];
  const byMonth = new Map(withQty.map((p) => [monthKey(p.d), p]));
  const yearAgo = byMonth.get(monthKey(addMonths(last.d, -12)));
  const prev = byMonth.get(monthKey(addMonths(last.d, -1)));
  const enough = (p?: Point) => (p?.q ?? 0) >= 100_000; // both months need 100 t+ for a fair comparison
  const qtyYoY = enough(yearAgo) && enough(last) ? pct(last.q, yearAgo!.q) : null;
  return {
    month: last.d,
    price: last.v,
    qtyT: (last.q ?? 0) / 1000,
    qtyYoY,
    priceMoM: pct(last.v, prev?.v ?? null),
    priceYoY: pct(last.v, yearAgo?.v ?? null),
    qty12: withQty.slice(-12).map((p) => (p.q ?? 0) / 1000),
  };
}

function buildRow(args: {
  id: string;
  type: Row["type"];
  name: string;
  short: string;
  category: string | null;
  group: string | null;
  isGroupData?: boolean;
  seriesId: string;
  freq: Frequency;
  s: VP[];
  imports: ImportSnap | null;
  cnyinr: number | null;
  hasDaily: boolean;
}): Row {
  const { s, freq } = args;
  const info = seriesInfo[args.seriesId];
  const last = s.at(-1) ?? null;
  const changes = periodChanges(s, freq);
  const typical = typicalMove(s, freq);
  const r = range52(s, freq);
  const spark = sparkline(s, freq);
  let inrPerKg: number | null = null;
  if (last && info.unit === "CNY/t" && args.cnyinr) inrPerKg = (last.v * args.cnyinr) / 1000;
  if (last && info.unit === "₹/kg") inrPerKg = last.v;
  return {
    id: args.id,
    type: args.type,
    name: args.name,
    short: args.short,
    category: args.category,
    group: args.group,
    isGroupData: args.isGroupData,
    seriesId: args.seriesId,
    frequency: freq,
    unit: info.unit,
    currency: info.currency,
    last: last?.v ?? null,
    lastDate: last?.d ?? null,
    inrPerKg,
    changes,
    trend: trend(s, freq),
    momentum: momentum(changes, typical, freq),
    typicalMove: typical,
    unusual: unusualMove(s, freq),
    hi52: r.hi,
    lo52: r.lo,
    rangePos: r.pos,
    spark: spark.map((p) => p.v),
    sparkDates: spark.length ? [spark[0].d, spark[spark.length - 1].d] : null,
    imports: args.imports,
    hasDaily: args.hasDaily,
    noisy: freq === "monthly" && (typical == null || typical > 30),
    rankable: !args.isGroupData && !(freq === "monthly" && (typical == null || typical > 30)),
  };
}

function eventText(row: Row, e: ReturnType<typeof detectEvents>[number]): string {
  const monthly = row.frequency === "monthly";
  const avg = monthly ? "3-month average crossed the 12-month average" : "20-day average crossed the 50-day average";
  switch (e.type) {
    case "cross-up":
      return `Trend turned up: the ${avg} from below.`;
    case "cross-down":
      return `Trend turned down: the ${avg} from above.`;
    case "high":
      return `New ${monthly ? "3-year" : "52-week"} high at ${fmtPrice(e.value, row.unit)}.`;
    case "low":
      return `New ${monthly ? "3-year" : "52-week"} low at ${fmtPrice(e.value, row.unit)}.`;
    case "jump":
    case "drop":
      return `${e.type === "jump" ? "Jumped" : "Fell"} ${fmtPct(Math.abs(e.pct ?? 0)).replace(/^[+−]/, "")} in one ${
        monthly ? "month" : "day"
      }, ${Math.abs(e.z ?? 0).toFixed(1)}× its typical ${monthly ? "monthly" : "daily"} move.`;
  }
}

export async function getBoard(): Promise<Board> {
  "use cache";
  cacheLife("market");
  cacheTag("market");

  const status = await getSeriesStatus();
  const latestKnown = Object.values(status)
    .map((s) => s.lastDate)
    .filter(Boolean)
    .sort()
    .at(-1);
  const since = latestKnown ? addDays(latestKnown, -900) : undefined;
  const ids = [...markets.map((m) => m.id), ...chemicals.map((c) => importSeriesId(c.id))];
  const raw = await getManyPoints(ids, since);
  const all: Record<string, Point[]> = Object.fromEntries(Object.entries(raw).map(([id, pts]) => [id, id.startsWith("imp-") ? filterImportOutliers(pts) : pts]));

  const cny = clean(all["cnyinr"] ?? []).at(-1);
  const usd = clean(all["usdinr"] ?? []).at(-1);
  const cnyinr = cny?.v ?? null;

  const rows: Row[] = [];
  for (const c of chemicals) {
    const sid = c.daily ?? importSeriesId(c.id);
    const freq: Frequency = c.daily ? "daily" : "monthly";
    rows.push(
      buildRow({
        id: c.id,
        type: "chemical",
        name: c.name,
        short: c.short,
        category: c.category,
        group: null,
        isGroupData: c.group,
        seriesId: sid,
        freq,
        s: clean(all[sid] ?? []),
        imports: importSnapshot(all[importSeriesId(c.id)] ?? []),
        cnyinr,
        hasDaily: Boolean(c.daily),
      }),
    );
  }
  for (const m of markets) {
    rows.push(
      buildRow({
        id: m.id,
        type: "market",
        name: m.name,
        short: m.short,
        category: null,
        group: m.group,
        seriesId: m.id,
        freq: "daily",
        s: clean(all[m.id] ?? []),
        imports: null,
        cnyinr,
        hasDaily: true,
      }),
    );
  }

  // Signal feed
  const events: SignalEvent[] = [];
  for (const row of rows) {
    if (!row.rankable && row.type === "chemical" && row.frequency === "monthly") continue; // too noisy for signals
    const s = clean(all[row.seriesId] ?? []);
    for (const e of detectEvents(s, row.frequency)) {
      events.push({
        id: `${row.id}:${e.type}:${e.d}`,
        rowId: row.id,
        name: row.name,
        type: e.type,
        d: e.d,
        text: eventText(row, e),
        value: e.value,
        z: e.z,
      });
    }
    const imp = row.imports;
    if (row.type === "chemical" && imp && imp.qtyYoY != null && imp.qtyT >= 100 && !row.isGroupData) {
      if (imp.qtyYoY >= 50 || imp.qtyYoY <= -40) {
        events.push({
          id: `${row.id}:imp:${imp.month}`,
          rowId: row.id,
          name: row.name,
          type: imp.qtyYoY > 0 ? "import-surge" : "import-slump",
          d: imp.month,
          text: `India imported ${fmtTonnes(imp.qtyT)} in ${fmtDate(imp.month, "month")}, ${fmtPct(imp.qtyYoY, 0)} vs a year earlier.`,
          value: imp.qtyT,
        });
      }
    }
  }
  events.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  const runs = await getRuns(80);
  const sources: Record<string, Run | null> = {};
  for (const src of ["futures", "fred", "fx", "tradestat", "news", "indiamart", "tradeindia", "exportersindia", "checks"]) sources[src] = runs.find((r) => r.source === src) ?? null;
  const okRuns = runs.filter((r) => r.ok);
  const changed = Object.values(status)
    .map((s) => s.changedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const asOf = rows
    .filter((r) => r.type === "market" && r.group === "China futures")
    .map((r) => r.lastDate)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    rows,
    events,
    fx: { cnyinr, usdinr: usd?.v ?? null, date: cny?.d ?? null },
    asOf: asOf ?? null,
    lastChecked: okRuns[0]?.at ?? null,
    lastChanged: changed ?? null,
    sources,
    storage: await storageMode(),
  };
}
