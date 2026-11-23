import { cacheLife, cacheTag } from "next/cache";
import { filterImportOutliers } from "./analytics";
import { chemicals, importSeriesId } from "./catalog";
import { getManyPoints, getOrigins } from "./repo";

export type ImportsData = {
  months: string[]; // YYYY-MM-01, ascending
  chems: { id: string; points: { d: string; v: number | null; q: number; val: number }[] }[];
  origins: Record<string, { month: string; china: number | null; top: { country: string; share: number }[] }>;
};

export async function getImportsData(): Promise<ImportsData> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  const raw = await getManyPoints(chemicals.map((c) => importSeriesId(c.id)));
  const originsAll = await getOrigins();
  const months = new Set<string>();
  const chems = chemicals.map((c) => {
    const pts = filterImportOutliers(raw[importSeriesId(c.id)] ?? []).map((p) => {
      months.add(p.d);
      return { d: p.d, v: p.v, q: p.q ?? 0, val: p.val ?? 0 };
    });
    return { id: c.id, points: pts };
  });
  const origins: ImportsData["origins"] = {};
  for (const c of chemicals) {
    const o = originsAll[c.id]?.[0];
    if (!o) continue;
    const tot = o.rows.reduce((a, r) => a + r.qYtd, 0);
    const china = o.rows.find((r) => r.country.startsWith("China"));
    origins[c.id] = {
      month: o.month,
      china: tot > 0 ? ((china?.qYtd ?? 0) / tot) * 100 : null,
      top: o.rows
        .filter((r) => r.qYtd > 0)
        .slice(0, 3)
        .map((r) => ({ country: r.country, share: tot > 0 ? (r.qYtd / tot) * 100 : 0 })),
    };
  }
  return { months: [...months].sort(), chems, origins };
}
