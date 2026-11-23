import { NextResponse } from "next/server";
import { clean, filterImportOutliers } from "@/lib/analytics";
import { chemicalById, chemicals, importSeriesId, markets, seriesInfo } from "@/lib/catalog";
import { getPoints } from "@/lib/repo";

/**
 * Daily/monthly values for one chemical (its main price series) or market,
 * as [date, value] pairs. Used by the Compare page. Ids: chemical id, market id,
 * or "imp-<chemical>" for the India import price.
 */
export function generateStaticParams() {
  return [...chemicals.map((c) => ({ id: c.id })), ...chemicals.map((c) => ({ id: importSeriesId(c.id) })), ...markets.map((m) => ({ id: m.id }))];
}

export async function GET(_req: Request, ctx: RouteContext<"/api/series/[id]">) {
  const { id } = await ctx.params;
  const chem = chemicalById[id];
  const sid = chem ? (chem.daily ?? importSeriesId(chem.id)) : id;
  const info = seriesInfo[sid];
  if (!info) return NextResponse.json({ error: "Unknown series" }, { status: 404 });
  let pts = await getPoints(sid, "2016-01-01");
  if (sid.startsWith("imp-")) pts = filterImportOutliers(pts);
  return NextResponse.json({
    id,
    seriesId: sid,
    name: chem?.name ?? info.name,
    unit: info.unit,
    frequency: info.frequency,
    points: clean(pts).map((p) => [p.d, Math.round(p.v * 10000) / 10000]),
  });
}
