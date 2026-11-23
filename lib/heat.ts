import { cacheLife, cacheTag } from "next/cache";
import { addDays, addMonths, clean, filterImportOutliers, monthKey, periodReturns, weekKey } from "./analytics";
import { getBoard } from "./board";
import { getManyPoints } from "./repo";

export type HeatData = {
  weekly: { columns: string[]; rows: { id: string; cells: (number | null)[] }[] };
  monthly: { columns: string[]; rows: { id: string; cells: (number | null)[] }[] };
};

/** Week-by-week and month-by-month % changes for every chemical and market. */
export async function getHeat(): Promise<HeatData> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  const board = await getBoard();
  const latest = board.asOf ?? board.rows.map((r) => r.lastDate).filter(Boolean).sort().at(-1)!;
  const since = addMonths(latest, -15);
  const raw = await getManyPoints(
    board.rows.map((r) => r.seriesId),
    since,
  );

  const lastWeek = weekKey(latest);
  const weekCols = Array.from({ length: 12 }, (_, i) => addDays(lastWeek, -7 * (11 - i)));
  const lastMonth = monthKey(latest);
  const monthCols = Array.from({ length: 13 }, (_, i) => monthKey(addMonths(lastMonth + "-01", -(12 - i))));

  const weekly: HeatData["weekly"]["rows"] = [];
  const monthly: HeatData["monthly"]["rows"] = [];
  for (const r of board.rows) {
    const pts = r.seriesId.startsWith("imp-") ? filterImportOutliers(raw[r.seriesId] ?? []) : (raw[r.seriesId] ?? []);
    const s = clean(pts);
    if (r.frequency === "daily") {
      const w = periodReturns(s, "week");
      weekly.push({ id: r.id, cells: weekCols.map((k) => w.get(k) ?? null) });
    }
    const m = periodReturns(s, "month");
    monthly.push({ id: r.id, cells: monthCols.map((k) => m.get(k) ?? null) });
  }
  return { weekly: { columns: weekCols, rows: weekly }, monthly: { columns: monthCols, rows: monthly } };
}
