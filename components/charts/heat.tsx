"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { fmtPct } from "@/lib/format";

gsap.registerPlugin(useGSAP);

/** Diverging fill: neutral grey at 0, stronger up/down colour with size of the move. */
export function divergingFill(v: number | null, cap: number, pos = "var(--up)", neg = "var(--down)") {
  if (v == null || !Number.isFinite(v)) return { background: "transparent", color: "var(--muted)", t: 0 };
  const t = Math.min(1, Math.abs(v) / cap);
  const step = Math.round(t * 5) / 5; // 5 steps per arm: readable classes, not a continuous smear
  const pctMix = Math.round(step * 88);
  return {
    background: `color-mix(in oklab, ${v >= 0 ? pos : neg} ${pctMix}%, var(--mid))`,
    color: step >= 0.6 ? "#ffffff" : "var(--ink)",
    t: step,
  };
}

export type HeatRow = { id: string; name: string; href?: string; slot?: number; tag?: ReactNode; cells: (number | null)[] };

export function Heatmap({ rows, columns, cap, unitLabel = "change" }: { rows: HeatRow[]; columns: { key: string; label: string; title?: string }[]; cap: number; unitLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; row: HeatRow; col: number } | null>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-cell]", { opacity: 0, scale: 0.6, duration: 0.45, ease: "power2.out", stagger: { amount: 0.8, grid: "auto", from: "start" } });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [rows.length, columns.length] },
  );
  return (
    <div ref={ref} className="relative overflow-x-auto" onMouseLeave={() => setTip(null)}>
      <table className="w-full border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium text-muted">Name</th>
            {columns.map((c) => (
              <th key={c.key} title={c.title} className="min-w-[58px] px-1 pb-1 text-center font-medium whitespace-nowrap text-muted">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  {r.slot && <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--s${r.slot})` }} />}
                  {r.href ? (
                    <Link href={r.href} className="text-ink hover:text-accent-ink hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="text-ink">{r.name}</span>
                  )}
                  {r.tag}
                </span>
              </th>
              {r.cells.map((v, i) => {
                const f = divergingFill(v, cap);
                return (
                  <td
                    key={i}
                    data-cell
                    tabIndex={0}
                    aria-label={`${r.name}, ${columns[i].title ?? columns[i].label}: ${v == null ? "no data" : fmtPct(v)}`}
                    className="tnum h-9 rounded-[6px] text-center font-medium outline-none transition-[filter,box-shadow] duration-150 hover:brightness-95 hover:ring-2 hover:ring-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ background: v == null ? "var(--surface-2)" : f.background, color: f.color }}
                    onMouseEnter={(e) => {
                      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const host = ref.current!.getBoundingClientRect();
                      setTip({ x: box.left - host.left + box.width / 2 + ref.current!.scrollLeft, y: box.top - host.top, row: r, col: i });
                    }}
                  >
                    {v == null ? "·" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {tip && (
        <div className="pop pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs whitespace-nowrap" style={{ left: tip.x, top: tip.y - 6 }}>
          <div className="tnum text-sm font-semibold text-ink">{fmtPct(tip.row.cells[tip.col])}</div>
          <div className="text-ink-2">
            {tip.row.name} · {columns[tip.col].title ?? columns[tip.col].label}
          </div>
          <div className="text-muted">{unitLabel}</div>
        </div>
      )}
    </div>
  );
}

export function HeatLegend({ cap, label }: { cap: number; label: string }) {
  const steps = [-1, -0.6, -0.2, 0, 0.2, 0.6, 1];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
      <span>{label}</span>
      <div className="flex overflow-hidden rounded-md">
        {steps.map((s) => (
          <span key={s} className="tnum flex h-6 w-12 items-center justify-center text-[10px] font-medium" style={{ background: divergingFill(s * cap, cap).background, color: divergingFill(s * cap, cap).color }}>
            {s === 0 ? "0" : `${s > 0 ? "+" : "−"}${Math.abs(s * cap).toFixed(0)}%`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Correlation grid: blue = move together, orange = move opposite, grey = no link. */
export function CorrMatrix({ names, matrix }: { names: string[]; matrix: (number | null)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr>
            <th />
            {names.map((n) => (
              <th key={n} className="max-w-[90px] px-1 pb-1 text-center font-medium text-muted">
                <span className="line-clamp-2">{n}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((n, i) => (
            <tr key={n}>
              <th scope="row" className="pr-2 text-right font-medium whitespace-nowrap text-ink-2">
                {n}
              </th>
              {matrix[i].map((r, j) => {
                const f = divergingFill(r == null ? null : r * 100, 100, "var(--s1)", "var(--s2)");
                return (
                  <td key={j} className="tnum h-10 w-[72px] rounded-[6px] text-center font-semibold" style={{ background: i === j ? "var(--surface-3)" : r == null ? "var(--surface-2)" : f.background, color: i === j ? "var(--muted)" : f.color }} title={`${n} vs ${names[j]}: ${r == null ? "not enough overlap" : r.toFixed(2)}`}>
                    {i === j ? "—" : r == null ? "·" : r.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
