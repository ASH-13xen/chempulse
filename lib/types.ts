export type Frequency = "daily" | "monthly";

/** One observation. `v` is the main value (close / spot / import price). */
export type Point = {
  d: string; // YYYY-MM-DD (monthly series use the 1st of the month)
  v: number | null;
  o?: number;
  h?: number;
  l?: number;
  vol?: number;
  oi?: number;
  q?: number; // import quantity, kg
  val?: number; // import value, Rs crore
};

export type Category = { id: string; name: string; slot: number };

export type Market = {
  id: string;
  name: string;
  short: string;
  source: "futures" | "fred" | "fx";
  symbol: string;
  exchange: string;
  unit: string;
  currency: string;
  group: string;
  about: string;
};

export type Chemical = {
  id: string;
  name: string;
  short: string;
  category: string;
  cas: string;
  hs: string[];
  hsNote?: string;
  group?: boolean;
  daily: string | null;
  drivers: string[];
  density?: number;
  news: string;
  about: string;
};

export type SeriesInfo = {
  id: string;
  name: string;
  short: string;
  kind: "futures" | "fred" | "fx" | "imports";
  unit: string;
  currency: string;
  frequency: Frequency;
  source: string;
  about: string;
  chemId?: string;
};

export type Periods = {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  ytd: number | null;
};

export type PeriodKey = keyof Periods;

export type Trend = { dir: "up" | "down" | "flat"; since: string | null; gap: number | null };

export type Unusual = { z: number; pct: number; d: string } | null;

export type ImportSnap = {
  month: string; // YYYY-MM-01
  price: number | null; // Rs/kg
  qtyT: number; // tonnes
  qtyYoY: number | null; // % vs same month last year
  priceMoM: number | null;
  priceYoY: number | null;
  qty12: number[]; // last 12 months tonnes (sparkline)
};

export type Row = {
  id: string; // chemical id or market id
  type: "chemical" | "market";
  name: string;
  short: string;
  category: string | null; // chemicals only
  group: string | null; // markets only (Energy, Currency, China futures)
  isGroupData?: boolean; // chemical import data is a broad customs group
  seriesId: string;
  frequency: Frequency;
  unit: string;
  currency: string;
  last: number | null;
  lastDate: string | null;
  inrPerKg: number | null; // converted value for CNY/t series and import series
  changes: Periods;
  trend: Trend;
  momentum: number | null; // risk-adjusted 1M (or 3M for monthly) move
  typicalMove: number | null; // % typical daily (or monthly) move
  unusual: Unusual;
  hi52: number | null;
  lo52: number | null;
  rangePos: number | null; // 0..1 position inside 52-week range
  spark: number[];
  sparkDates: [string, string] | null;
  imports: ImportSnap | null;
  hasDaily: boolean;
  noisy: boolean; // monthly import price jumps around too much to read as a trend
  rankable: boolean; // included in movers, category averages and "biggest move"
};

export type SignalEvent = {
  id: string;
  rowId: string;
  name: string;
  type: "cross-up" | "cross-down" | "high" | "low" | "jump" | "drop" | "import-surge" | "import-slump";
  d: string;
  text: string;
  value: number | null;
  z?: number;
};

export type Run = {
  source: string;
  at: string;
  ok: boolean;
  new?: number;
  updated?: number;
  unchanged?: number;
  seconds?: number;
  error?: string;
  warnings?: string[];
  latest?: string;
  checks?: { name: string; ok: boolean; detail: string }[];
};

export type SeriesStatus = Record<string, { firstDate?: string | null; lastDate?: string | null; count?: number; changedAt?: string | null }>;

export type NewsItem = { id: string; chem: string; title: string; source: string; link: string; published: string; kind?: "regulatory"; category?: string };

export type OriginRow = { country: string; q: number; val: number; qYtd: number; valYtd: number };

export type Quote = {
  id: string;
  chem: string;
  date: string;
  city: string;
  supplier: string;
  grade: string;
  price: number;
  unit: "kg" | "L" | "t";
  pricePerKg: number | null;
  note: string;
  createdAt: string;
};

export type Board = {
  rows: Row[];
  events: SignalEvent[];
  fx: { cnyinr: number | null; usdinr: number | null; date: string | null };
  asOf: string | null; // latest data date across daily series
  lastChecked: string | null; // latest successful collector run
  lastChanged: string | null; // latest time any price changed
  sources: Record<string, Run | null>;
  storage: "mongo" | "json";
};
