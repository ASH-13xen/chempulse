"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fmtNum } from "@/lib/format";
import { useSettings } from "./settings";

/**
 * One switch for every price on the site: Rupees, US dollars, or the original
 * units (¥/tonne for China futures, $/barrel for crude…). Static numbers use the
 * latest ECB rates; charts convert each day at that day's rate.
 */
export type CurrencyMode = "inr" | "usd" | "native";
type Fx = { usdinr: number | null; cnyinr: number | null };

const FxContext = createContext<Fx>({ usdinr: null, cnyinr: null });

export function MoneyProvider({ fx, children }: { fx: Fx; children: ReactNode }) {
  return <FxContext.Provider value={fx}>{children}</FxContext.Provider>;
}

const num = (v: number, digits?: number) => fmtNum(v, digits == null ? {} : { digits });

/** Convert a value in `unit` to the display currency. Returns the new value and unit label. */
export function convert(v: number, unit: string, mode: CurrencyMode, fx: Fx): { v: number; unit: string; approx: boolean } {
  const { usdinr, cnyinr } = fx;
  if (unit === "CNY/t") {
    if (mode === "inr" && cnyinr) return { v: (v * cnyinr) / 1000, unit: "₹/kg", approx: true };
    if (mode === "usd" && cnyinr && usdinr) return { v: (v * cnyinr) / usdinr / 1000, unit: "$/kg", approx: true };
    return { v, unit, approx: false };
  }
  if (unit === "₹/kg") {
    if (mode === "usd" && usdinr) return { v: v / usdinr, unit: "$/kg", approx: false };
    return { v, unit, approx: false };
  }
  if (unit.startsWith("USD/")) {
    if (mode === "inr" && usdinr) return { v: v * usdinr, unit: `₹/${unit.slice(4)}`, approx: false };
    return { v, unit: `$/${unit.slice(4)}`, approx: false };
  }
  return { v, unit, approx: false }; // exchange rates stay as they are
}

export function formatIn(v: number | null | undefined, unit: string) {
  if (v == null || !Number.isFinite(v)) return "–";
  if (unit === "CNY/t") return `¥${num(v, 0)}/t`;
  if (unit.startsWith("₹/")) return `₹${num(v)}/${unit.slice(2)}`;
  if (unit.startsWith("$/")) return `$${num(v, Math.abs(v) < 10 ? 2 : undefined)}/${unit.slice(2)}`;
  if (unit.startsWith("INR per")) return `₹${num(v, unit.includes("CNY") ? 3 : 2)}`;
  return `${num(v)} ${unit}`;
}

export function useMoney() {
  const fx = useContext(FxContext);
  const { prices } = useSettings();
  const mode: CurrencyMode = prices === "usd" ? "usd" : prices === "native" ? "native" : "inr";
  return useMemo(() => {
    const fmt = (v: number | null | undefined, unit: string) => {
      if (v == null || !Number.isFinite(v)) return "–";
      const c = convert(v, unit, mode, fx);
      return `${c.approx ? "≈" : ""}${formatIn(c.v, c.unit)}`;
    };
    const kgUnit = mode === "usd" ? "$/kg" : "₹/kg";
    return {
      mode,
      fx,
      fmt,
      convert: (v: number, unit: string) => convert(v, unit, mode, fx),
      /** a ₹/kg value shown in the chosen currency */
      kg: (inrPerKg: number | null | undefined, digits?: number) => {
        if (inrPerKg == null || !Number.isFinite(inrPerKg)) return "–";
        if (mode === "usd" && fx.usdinr) {
          // ₹ digits don't carry over: ₹93 is "$1.06", not "$1"
          const d = inrPerKg / fx.usdinr;
          return `$${num(d, Math.abs(d) < 100 ? 2 : 1)}`;
        }
        return `₹${num(inrPerKg, digits)}`;
      },
      /** raw number in the chosen per-kg currency (for charts) */
      kgValue: (inrPerKg: number) => (mode === "usd" && fx.usdinr ? inrPerKg / fx.usdinr : inrPerKg),
      kgUnit,
      symbol: mode === "usd" ? "$" : "₹",
      /** ₹ crore shown as ₹ crore or US$ million */
      crore: (cr: number | null | undefined) => {
        if (cr == null || !Number.isFinite(cr)) return "–";
        if (mode === "usd" && fx.usdinr) return `$${num((cr * 1e7) / fx.usdinr / 1e6, 0)} m`;
        return `₹${num(cr, 0)} cr`;
      },
    };
  }, [mode, fx]);
}
