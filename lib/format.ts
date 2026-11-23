const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtNum(v: number | null | undefined, opts: { digits?: number; compact?: boolean } = {}) {
  if (v == null || !Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  const digits = opts.digits ?? (abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : abs >= 1 ? 2 : 3);
  if (opts.compact && abs >= 10_000) {
    return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = true) {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = Math.abs(v).toFixed(digits);
  if (!signed) return `${s}%`;
  if (Number(s) === 0) return `0.${"0".repeat(digits)}%`;
  return `${v > 0 ? "+" : "−"}${s}%`;
}

/** Tonnes with Indian-style compact units. */
export function fmtTonnes(t: number | null | undefined) {
  if (t == null || !Number.isFinite(t)) return "–";
  if (t >= 100_000) return `${fmtNum(t / 100_000, { digits: 2 })} lakh t`;
  if (t >= 1000) return `${fmtNum(t / 1000, { digits: 1 })}k t`;
  return `${fmtNum(t, { digits: 0 })} t`;
}

export function fmtDate(d: string | null | undefined, style: "short" | "long" | "month" = "short") {
  if (!d) return "–";
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  if (style === "month") return `${MONTHS[m - 1]} ${y}`;
  if (style === "long") return `${dd} ${MONTHS[m - 1]} ${y}`;
  return `${dd} ${MONTHS[m - 1]}`;
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export function unitShort(unit: string) {
  return unit.replace("CNY/t", "¥/t").replace("USD/", "$/");
}

/** Formats a price with its unit, e.g. "¥8,770/t" or "₹84.2/kg" or "$92.9/bbl". */
export function fmtPrice(v: number | null | undefined, unit: string) {
  if (v == null) return "–";
  if (unit === "CNY/t") return `¥${fmtNum(v, { digits: 0 })}/t`;
  if (unit === "₹/kg") return `₹${fmtNum(v)}/kg`;
  if (unit.startsWith("USD/")) return `$${fmtNum(v)}/${unit.slice(4)}`;
  if (unit.startsWith("INR per")) return `₹${fmtNum(v, { digits: unit.includes("CNY") ? 3 : 2 })}`;
  return `${fmtNum(v)} ${unit}`;
}

export const PERIOD_LABEL: Record<string, string> = {
  d1: "1 day",
  w1: "1 week",
  m1: "1 month",
  m3: "3 months",
  m6: "6 months",
  y1: "1 year",
  ytd: "Year to date",
};

export const PERIOD_SHORT: Record<string, string> = { d1: "1D", w1: "1W", m1: "1M", m3: "3M", m6: "6M", y1: "1Y", ytd: "YTD" };
