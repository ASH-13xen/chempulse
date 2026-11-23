/**
 * Pure calculations behind every number on the site. No I/O here, so the same
 * functions run on the server (board, alerts) and in the browser (charts).
 */
import type { Frequency, Periods, Point, Trend, Unusual } from "./types";

export type VP = { d: string; v: number };

const DAY = 86_400_000;

export function clean(points: Point[]): VP[] {
  const out: VP[] = [];
  for (const p of points) if (p.v != null && Number.isFinite(p.v)) out.push({ d: p.d, v: p.v });
  return out;
}

/**
 * Import prices from tiny shipments are misleading (28 t at an odd price vs a
 * normal 4,000 t month). Hide the price for months whose volume is under 25% of
 * the typical volume around them (median of the surrounding 13 months), or
 * under 5 tonnes. Quantities stay; only the price is blanked.
 */
export function filterImportOutliers(points: Point[]): Point[] {
  const qs = points.map((p) => p.q ?? 0);
  return points.map((p, i) => {
    if (p.v == null || p.q == null) return p;
    const win = qs.slice(Math.max(0, i - 6), i + 7).filter((q) => q > 0).sort((a, b) => a - b);
    const med = win.length ? win[Math.floor(win.length / 2)] : 0;
    return p.q < Math.max(5000, 0.25 * med) ? { ...p, v: null } : p;
  });
}

export function toTime(d: string) {
  return Date.parse(d + "T00:00:00Z");
}

export function addDays(d: string, n: number) {
  return new Date(toTime(d) + n * DAY).toISOString().slice(0, 10);
}

export function addMonths(d: string, n: number) {
  const [y, m, dd] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(dd, dim));
  return first.toISOString().slice(0, 10);
}

export function monthKey(d: string) {
  return d.slice(0, 7);
}

/** Monday of the week containing d. */
export function weekKey(d: string) {
  const t = new Date(toTime(d));
  const dow = (t.getUTCDay() + 6) % 7;
  return new Date(t.getTime() - dow * DAY).toISOString().slice(0, 10);
}

/** Index of the last point dated on or before `d`, or -1. */
export function indexAtOrBefore(s: VP[], d: string) {
  let lo = 0;
  let hi = s.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid].d <= d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function pct(now: number | null | undefined, then: number | null | undefined) {
  if (now == null || then == null || !(then > 0)) return null;
  return (now / then - 1) * 100;
}

function mean(a: number[]) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
}

export function stdev(a: number[]) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/** % change between consecutive points. */
export function returns(s: VP[]) {
  const out: { d: string; r: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    const r = pct(s[i].v, s[i - 1].v);
    if (r != null) out.push({ d: s[i].d, r });
  }
  return out;
}

/** Simple moving average aligned with the input (null until enough points). */
export function sma(values: number[], n: number) {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// ------------------------------------------------------------------ changes

function changeVsDate(s: VP[], target: string, maxGapDays: number) {
  if (!s.length) return null;
  const i = indexAtOrBefore(s, target);
  if (i < 0) return null;
  if (toTime(target) - toTime(s[i].d) > maxGapDays * DAY) return null;
  return pct(s[s.length - 1].v, s[i].v);
}

function changeVsMonth(s: VP[], monthsBack: number) {
  if (!s.length) return null;
  const last = s[s.length - 1];
  const target = monthKey(addMonths(last.d, -monthsBack));
  const p = s.find((x) => monthKey(x.d) === target);
  return p ? pct(last.v, p.v) : null;
}

export function periodChanges(s: VP[], freq: Frequency): Periods {
  const empty: Periods = { d1: null, w1: null, m1: null, m3: null, m6: null, y1: null, ytd: null };
  if (s.length < 2) return empty;
  const last = s[s.length - 1];
  if (freq === "monthly") {
    const decPrev = `${Number(last.d.slice(0, 4)) - 1}-12`;
    const dec = s.find((x) => monthKey(x.d) === decPrev);
    return {
      ...empty,
      m1: changeVsMonth(s, 1),
      m3: changeVsMonth(s, 3),
      m6: changeVsMonth(s, 6),
      y1: changeVsMonth(s, 12),
      ytd: last.d.slice(5, 7) === "01" || !dec ? null : pct(last.v, dec.v),
    };
  }
  const yearEnd = `${Number(last.d.slice(0, 4)) - 1}-12-31`;
  return {
    d1: pct(last.v, s[s.length - 2].v),
    w1: changeVsDate(s, addDays(last.d, -7), 10),
    m1: changeVsDate(s, addMonths(last.d, -1), 10),
    m3: changeVsDate(s, addMonths(last.d, -3), 12),
    m6: changeVsDate(s, addMonths(last.d, -6), 12),
    y1: changeVsDate(s, addMonths(last.d, -12), 15),
    ytd: changeVsDate(s, yearEnd, 15),
  };
}

// ------------------------------------------------------------------ trend & volatility

const WIN = { daily: { short: 20, long: 50 }, monthly: { short: 3, long: 12 } } as const;

export function movingAverages(s: VP[], freq: Frequency) {
  const vals = s.map((p) => p.v);
  return { short: sma(vals, WIN[freq].short), long: sma(vals, WIN[freq].long) };
}

/**
 * Trend = where the short average sits against the long average
 * (20 vs 50 trading days for daily data, 3 vs 12 months for monthly data).
 */
export function trend(s: VP[], freq: Frequency): Trend {
  const { short, long } = movingAverages(s, freq);
  const n = s.length;
  if (n < WIN[freq].long + 2 || short[n - 1] == null || long[n - 1] == null) return { dir: "flat", since: null, gap: null };
  const dirAt = (i: number): Trend["dir"] => {
    const a = short[i];
    const b = long[i];
    if (a == null || b == null) return "flat";
    const g = (a / b - 1) * 100;
    const band = freq === "daily" ? 0.3 : 1;
    if (g > band && s[i].v > b) return "up";
    if (g < -band && s[i].v < b) return "down";
    return "flat";
  };
  const dir = dirAt(n - 1);
  let i = n - 1;
  while (i > 0 && dirAt(i - 1) === dir) i--;
  return { dir, since: i > 0 ? s[i].d : null, gap: ((short[n - 1]! / long[n - 1]!) - 1) * 100 };
}

/** Typical size of one step (a trading day, or a month), as a % (standard deviation). */
export function typicalMove(s: VP[], freq: Frequency) {
  const r = returns(s).map((x) => x.r);
  const window = freq === "daily" ? 90 : 24;
  const sd = stdev(r.slice(-window));
  return Number.isFinite(sd) ? sd : null;
}

export function momentum(ch: Periods, typical: number | null, freq: Frequency) {
  if (typical == null || typical === 0) return null;
  if (freq === "daily") return ch.m1 == null ? null : ch.m1 / (typical * Math.sqrt(21));
  return ch.m3 == null ? null : ch.m3 / (typical * Math.sqrt(3));
}

/** The latest step, measured against how big steps normally are. */
export function unusualMove(s: VP[], freq: Frequency): Unusual {
  const r = returns(s);
  const window = freq === "daily" ? 90 : 24;
  if (r.length < window / 2) return null;
  const last = r[r.length - 1];
  const sd = stdev(r.slice(-window - 1, -1).map((x) => x.r));
  if (!Number.isFinite(sd) || sd === 0) return null;
  const z = last.r / sd;
  const threshold = freq === "daily" ? 2.5 : 2;
  return Math.abs(z) >= threshold ? { z, pct: last.r, d: last.d } : null;
}

export function range52(s: VP[], freq: Frequency) {
  if (!s.length) return { hi: null, lo: null, pos: null };
  const last = s[s.length - 1];
  const from = freq === "daily" ? addDays(last.d, -365) : addMonths(last.d, -11);
  const win = s.filter((p) => p.d >= from).map((p) => p.v);
  const hi = Math.max(...win);
  const lo = Math.min(...win);
  return { hi, lo, pos: hi > lo ? (last.v - lo) / (hi - lo) : null };
}

export function maxDrawdown(s: VP[]) {
  let peak = -Infinity;
  let worst = 0;
  for (const p of s) {
    peak = Math.max(peak, p.v);
    if (peak > 0) worst = Math.min(worst, (p.v / peak - 1) * 100);
  }
  return worst;
}

export function sparkline(s: VP[], freq: Frequency, maxPoints = 60) {
  const tail = freq === "daily" ? s.slice(-120) : s.slice(-24);
  if (tail.length <= maxPoints) return tail;
  const step = tail.length / maxPoints;
  const out: VP[] = [];
  for (let i = 0; i < maxPoints - 1; i++) out.push(tail[Math.floor(i * step)]);
  out.push(tail[tail.length - 1]);
  return out;
}

// ------------------------------------------------------------------ periods, seasonality, correlation

/** Last value in each week or month. */
export function periodCloses(s: VP[], period: "week" | "month") {
  const m = new Map<string, VP>();
  for (const p of s) m.set(period === "week" ? weekKey(p.d) : monthKey(p.d), p);
  return [...m.entries()].map(([key, p]) => ({ key, d: p.d, v: p.v }));
}

/** % change of each week/month vs the one before (consecutive periods only). */
export function periodReturns(s: VP[], period: "week" | "month") {
  const closes = periodCloses(s, period);
  const out = new Map<string, number>();
  for (let i = 1; i < closes.length; i++) {
    const prevKey = period === "week" ? addDays(closes[i].key, -7) : monthKey(addMonths(closes[i].key + "-01", -1));
    if (closes[i - 1].key !== prevKey) continue;
    const r = pct(closes[i].v, closes[i - 1].v);
    if (r != null) out.set(closes[i].key, r);
  }
  return out;
}

export function correlation(a: Map<string, number>, b: Map<string, number>, minN = 12) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [k, x] of a) {
    const y = b.get(k);
    if (y != null) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < minN) return { r: null as number | null, n: xs.length };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  return { r, n: xs.length };
}

export function corrLabel(r: number | null) {
  if (r == null) return "Not enough data";
  const a = Math.abs(r);
  const strength = a >= 0.6 ? "Strong" : a >= 0.35 ? "Moderate" : a >= 0.15 ? "Weak" : "No clear";
  return a < 0.15 ? "No clear link" : `${strength} ${r > 0 ? "same-direction" : "opposite"} link`;
}

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Average % change for each calendar month across all years available. */
export function seasonality(s: VP[]) {
  const r = periodReturns(s, "month");
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const [key, v] of r) buckets[Number(key.slice(5, 7)) - 1].push(v);
  return buckets.map((b, i) => ({
    month: MONTH_NAMES[i],
    avg: b.length ? mean(b) : null,
    up: b.filter((x) => x > 0).length,
    n: b.length,
  }));
}

/** Rebase to 100 at the first point on/after `start`. */
export function rebase(s: VP[], start: string) {
  const i = s.findIndex((p) => p.d >= start);
  if (i < 0) return [];
  const base = s[i].v;
  return base > 0 ? s.slice(i).map((p) => ({ d: p.d, v: (p.v / base) * 100 })) : [];
}

// ------------------------------------------------------------------ events (alerts feed)

export type RawEvent = { type: "cross-up" | "cross-down" | "high" | "low" | "jump" | "drop"; d: string; value: number; z?: number; pct?: number };

/** Signals inside the last `days` days (daily) or `months` months (monthly). */
export function detectEvents(s: VP[], freq: Frequency, windowDays = 30): RawEvent[] {
  const out: RawEvent[] = [];
  const n = s.length;
  if (n < 30) return out;
  const from = freq === "daily" ? addDays(s[n - 1].d, -windowDays) : addMonths(s[n - 1].d, -3);
  const firstIdx = s.findIndex((p) => p.d > from);
  if (firstIdx < 0) return out;
  const start = Math.max(1, firstIdx);

  // trend crossovers
  const { short, long } = movingAverages(s, freq);
  for (let i = Math.max(start, 1); i < n; i++) {
    const a0 = short[i - 1];
    const b0 = long[i - 1];
    const a1 = short[i];
    const b1 = long[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
    if (a0 <= b0 && a1 > b1) out.push({ type: "cross-up", d: s[i].d, value: s[i].v });
    if (a0 >= b0 && a1 < b1) out.push({ type: "cross-down", d: s[i].d, value: s[i].v });
  }

  // new highs / lows over the previous year (daily) or three years (monthly)
  const lookback = freq === "daily" ? 250 : 36;
  let lastHigh: RawEvent | null = null;
  let lastLow: RawEvent | null = null;
  for (let i = start; i < n; i++) {
    if (i < lookback / 2) continue;
    const prev = s.slice(Math.max(0, i - lookback), i).map((p) => p.v);
    if (s[i].v > Math.max(...prev)) lastHigh = { type: "high", d: s[i].d, value: s[i].v };
    if (s[i].v < Math.min(...prev)) lastLow = { type: "low", d: s[i].d, value: s[i].v };
  }
  if (lastHigh) out.push(lastHigh);
  if (lastLow) out.push(lastLow);

  // unusually large single moves
  const r = returns(s);
  const window = freq === "daily" ? 90 : 24;
  const threshold = freq === "daily" ? 2.5 : 2;
  const big: RawEvent[] = [];
  for (let j = Math.max(window, 1); j < r.length; j++) {
    if (r[j].d <= from) continue;
    const sd = stdev(r.slice(j - window, j).map((x) => x.r));
    if (!Number.isFinite(sd) || sd === 0) continue;
    const z = r[j].r / sd;
    if (Math.abs(z) >= threshold) {
      const idx = s.findIndex((p) => p.d === r[j].d);
      big.push({ type: z > 0 ? "jump" : "drop", d: r[j].d, value: s[idx]?.v ?? 0, z, pct: r[j].r });
    }
  }
  big.sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!));
  out.push(...big.slice(0, 2));
  return out.sort((a, b) => (a.d < b.d ? 1 : -1));
}
