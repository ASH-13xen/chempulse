"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum } from "@/lib/format";

export type StripDot = { id: string; group: string; value: number; label: string; sub?: string; slot: number; hollow?: boolean };

/**
 * One row per region, one dot per seller asking price (₹/kg). The median of each
 * row is a short vertical bar; an optional reference line marks India's import price.
 * Hollow dots are flagged outliers / lab packs, drawn but not counted.
 */
export function StripPlot({ dots, groups, reference, referenceLabel, medians, symbol = "₹" }: { dots: StripDot[]; groups: string[]; reference?: number | null; referenceLabel?: string; medians: Record<string, number | null>; symbol?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; d: StripDot } | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const { lo, hi } = useMemo(() => {
    const vals = dots.filter((d) => !d.hollow).map((d) => d.value).sort((a, b) => a - b);
    if (!vals.length) return { lo: 0, hi: 1 };
    const p = (q: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * q)))];
    let a = p(0.02);
    let b = p(0.98);
    if (reference != null) {
      a = Math.min(a, reference);
      b = Math.max(b, reference);
    }
    const pad = (b - a) * 0.08 || b * 0.1 || 1;
    return { lo: Math.max(0, a - pad), hi: b + pad };
  }, [dots, reference]);

  const left = 130;
  const right = 16;
  const rowH = 34;
  const top = 26;
  const height = top + groups.length * rowH + 28;
  const x = (v: number) => left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * Math.max(1, w - left - right);
  const ticks = useMemo(() => {
    const span = hi - lo;
    const raw = span / 5;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 6) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }, [lo, hi]);

  // deterministic vertical jitter so dots in a row don't sit on top of each other
  const jitter = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((Math.abs(h) % 1000) / 1000 - 0.5) * (rowH - 16);
  };

  return (
    <div ref={box} className="relative w-full" onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Seller asking prices by region">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top - 6} y2={height - 24} stroke="var(--grid)" />
              <text x={x(t)} y={height - 8} textAnchor="middle" className="tnum fill-[var(--muted)] text-[11px]">
                {symbol}
                {fmtNum(t, { digits: t < 10 ? 2 : 0 })}
              </text>
            </g>
          ))}
          {reference != null && reference >= lo && reference <= hi && (
            <g>
              <line x1={x(reference)} x2={x(reference)} y1={top - 10} y2={height - 24} stroke="var(--ink-2)" strokeWidth={1.5} />
              <text x={x(reference)} y={top - 14} textAnchor="middle" className="fill-[var(--ink-2)] text-[11px] font-medium">
                {referenceLabel ?? "Reference"} {symbol}
                {fmtNum(reference, { digits: reference < 10 ? 2 : 0 })}
              </text>
            </g>
          )}
          {groups.map((g, i) => {
            const cy = top + i * rowH + rowH / 2;
            const med = medians[g];
            const n = dots.filter((d) => d.group === g && !d.hollow).length;
            return (
              <g key={g}>
                <rect x={left} y={top + i * rowH + 2} width={Math.max(0, w - left - right)} height={rowH - 4} rx={6} fill={i % 2 ? "transparent" : "var(--surface-2)"} />
                <text x={left - 10} y={cy} dy="0.32em" textAnchor="end" className="fill-[var(--ink)] text-[12px] font-medium">
                  {g}
                </text>
                <text x={left - 10} y={cy + 12} dy="0.32em" textAnchor="end" className="fill-[var(--muted)] text-[10px]">
                  {n} priced
                </text>
                {dots
                  .filter((d) => d.group === g)
                  .map((d) => (
                    <circle
                      key={d.id}
                      cx={x(d.value)}
                      cy={cy + jitter(d.id)}
                      r={d.hollow ? 4 : 4.5}
                      fill={d.hollow ? "var(--surface)" : `var(--s${d.slot})`}
                      fillOpacity={d.hollow ? 1 : 0.85}
                      stroke={d.hollow ? "var(--muted)" : "var(--surface)"}
                      strokeWidth={d.hollow ? 1.5 : 1.5}
                      className="cursor-pointer transition-[r] duration-150 hover:[r:7]"
                      onMouseEnter={() => setTip({ x: x(d.value), y: cy + jitter(d.id), d })}
                    />
                  ))}
                {med != null && <rect x={x(med) - 1.5} y={cy - rowH / 2 + 5} width={3} height={rowH - 10} rx={1.5} fill="var(--ink)" />}
              </g>
            );
          })}
        </svg>
      )}
      {tip && (
        <div className="pop pointer-events-none absolute z-20 max-w-[280px] -translate-x-1/2 -translate-y-full px-3 py-2 text-xs" style={{ left: tip.x, top: tip.y - 10 }}>
          <div className="tnum text-sm font-semibold text-ink">
            {symbol}
            {fmtNum(tip.d.value)}/kg
          </div>
          <div className="font-medium text-ink-2">{tip.d.label}</div>
          {tip.d.sub && <div className="text-muted">{tip.d.sub}</div>}
        </div>
      )}
    </div>
  );
}
