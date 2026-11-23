import raw from "@/config/catalog.json";
import type { Category, Chemical, Market, SeriesInfo } from "./types";

export const categories = raw.categories as Category[];
export const markets = raw.markets as Market[];
export const chemicals = raw.chemicals as Chemical[];

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c])) as Record<string, Category>;
export const chemicalById = Object.fromEntries(chemicals.map((c) => [c.id, c])) as Record<string, Chemical>;
export const marketById = Object.fromEntries(markets.map((m) => [m.id, m])) as Record<string, Market>;

const SOURCE_LABEL: Record<string, string> = {
  futures: "China futures exchange (via AkShare)",
  fred: "FRED / US EIA",
  fx: "European Central Bank (Frankfurter)",
  imports: "Tradestat, Dept. of Commerce (India)",
};

export function importSeriesId(chemId: string) {
  return `imp-${chemId}`;
}

/** Every series the site knows about: markets plus one import series per chemical. */
export const seriesInfo: Record<string, SeriesInfo> = Object.fromEntries([
  ...markets.map((m) => [
    m.id,
    {
      id: m.id,
      name: m.name,
      short: m.short,
      kind: m.source,
      unit: m.unit,
      currency: m.currency,
      frequency: "daily",
      source: `${m.exchange} · ${SOURCE_LABEL[m.source]}`,
      about: m.about,
    } satisfies SeriesInfo,
  ]),
  ...chemicals.map((c) => [
    importSeriesId(c.id),
    {
      id: importSeriesId(c.id),
      name: `${c.name} – India import price`,
      short: c.short,
      kind: "imports",
      unit: "₹/kg",
      currency: "INR",
      frequency: "monthly",
      source: SOURCE_LABEL.imports,
      about: `Average price India paid for imports (customs value ÷ quantity), HS ${c.hs.join(" + ")}.`,
      chemId: c.id,
    } satisfies SeriesInfo,
  ]),
]);

export function primarySeriesId(c: Chemical) {
  return c.daily ?? importSeriesId(c.id);
}

/** Things that can be opened as a page: chemicals and markets. */
export function hrefFor(id: string) {
  if (chemicalById[id]) return `/chemical/${id}`;
  if (marketById[id]) return `/market/${id}`;
  return "/";
}

export function displayName(id: string) {
  return chemicalById[id]?.name ?? marketById[id]?.name ?? seriesInfo[id]?.name ?? id;
}
