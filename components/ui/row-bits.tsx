"use client";

import { Star } from "lucide-react";
import { fmtPrice } from "@/lib/format";
import type { Row } from "@/lib/types";
import { useMoney } from "../providers/money";
import { useWatchlist, type WatchKind } from "../providers/watchlist";

/** A price in the currency chosen in settings (₹, $ or the original unit). */
export function PriceText({ row, className = "" }: { row: Pick<Row, "last" | "unit" | "inrPerKg">; className?: string }) {
  const money = useMoney();
  const shown = money.fmt(row.last, row.unit);
  const original = fmtPrice(row.last, row.unit);
  return (
    <span className={`tnum ${className}`} title={shown !== original ? `${original} (original unit)` : undefined}>
      {shown}
    </span>
  );
}

export function StarButton({ id, name, kind = "chem", className = "" }: { id: string; name: string; kind?: WatchKind; className?: string }) {
  const wl = useWatchlist();
  const on = wl.has(kind, id);
  return (
    <button
      type="button"
      data-noexport="true"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      title={on ? "Remove from watchlist" : "Add to watchlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void wl.toggle(kind, id);
      }}
      className={`inline-flex size-7 items-center justify-center rounded-md transition-transform hover:bg-surface-2 active:scale-90 ${className}`}
    >
      <Star className={`size-4 transition-colors ${on ? "fill-[var(--warn)] text-[var(--warn)]" : "text-muted"}`} />
    </button>
  );
}

/** Where today's price sits between the 52-week low and high. */
export function RangeBar({ pos, lo, hi, unit, compact = false }: { pos: number | null; lo: number | null; hi: number | null; unit: string; compact?: boolean }) {
  const money = useMoney();
  if (pos == null) return <span className="text-xs text-muted">–</span>;
  return (
    <div className={compact ? "w-24" : "w-full"} title={`Low ${money.fmt(lo, unit)} · High ${money.fmt(hi, unit)}`}>
      <div className="relative h-1.5 rounded-full bg-[var(--surface-3)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklab,var(--accent)_35%,transparent)]" style={{ width: `${pos * 100}%` }} />
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] shadow" style={{ left: `${pos * 100}%` }} />
      </div>
      {!compact && (
        <div className="tnum mt-1 flex justify-between text-[0.6875rem] text-muted">
          <span>{money.fmt(lo, unit)}</span>
          <span>{money.fmt(hi, unit)}</span>
        </div>
      )}
    </div>
  );
}
