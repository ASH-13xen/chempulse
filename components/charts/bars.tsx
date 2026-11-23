"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Bar with a 4px rounded data end and a square baseline end. */
function barPath(x: number, y0: number, y1: number, w: number, r = 4) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) return `M${x},${y0}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${y0}Z`;
  const bot = top + h;
  return `M${x},${y0}V${bot - rr}Q${x},${bot} ${x + rr},${bot}H${x + w - rr}Q${x + w},${bot} ${x + w},${bot - rr}V${y0}Z`;
}

type Tip = { x: number; y: number; content: ReactNode } | null;

function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="pop pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs whitespace-nowrap" style={{ left: tip.x, top: tip.y - 8 }}>
      {tip.content}
    </div>
  );
}

export type Col = { label: string; value: number | null; detail?: ReactNode };

/** Vertical columns. `diverging` colours by sign (up/down); otherwise one colour. */
export function ColumnChart({ data, format, diverging = false, slot = 1, height = 220, capLabels = true, axisFormat }: { data: Col[]; format: (v: number) => string; diverging?: boolean; slot?: number; height?: number; capLabels?: boolean; axisFormat?: (v: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const svg = useRef<SVGSVGElement>(null);
  const vals = data.map((d) => d.value ?? 0);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(lo, ticks[0]);
  const yMax = Math.max(hi, ticks[ticks.length - 1]);
  const pad = { l: 46, r: 8, t: capLabels ? 18 : 8, b: 26 };
  const ih = height - pad.t - pad.b;
  const iw = Math.max(0, width - pad.l - pad.r);
  const y = (v: number) => pad.t + (yMax === yMin ? ih / 2 : (1 - (v - yMin) / (yMax - yMin)) * ih);
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(24, band * 0.62);
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 44))));
  const fmtAxis = axisFormat ?? format;

  useGSAP(
    () => {
      if (!svg.current || !width) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(svg.current!.querySelectorAll("[data-bar]"), { scaleY: 0, transformOrigin: `50% ${y(0)}px`, duration: 0.7, ease: "power3.out", stagger: 0.025 });
      });
      return () => mm.revert();
    },
    { scope: svg, dependencies: [width > 0, data.length] },
  );

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg ref={svg} width={width} height={height} role="img" aria-label="Column chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum fill-[var(--muted)] text-[0.6875rem]">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * band + (band - bw) / 2;
            const v = d.value;
            const color = v == null ? "var(--grid)" : diverging ? (v >= 0 ? "var(--up)" : "var(--down)") : `var(--s${slot})`;
            return (
              <g key={d.label + i}>
                {v != null && <path data-bar d={barPath(x, y(0), y(v), bw)} fill={color} />}
                {capLabels && v != null && bw >= 14 && (
                  <text x={x + bw / 2} y={v >= 0 ? y(v) - 5 : y(v) + 12} textAnchor="middle" className="tnum fill-[var(--ink-2)] text-[0.625rem] font-medium">
                    {format(v)}
                  </text>
                )}
                {i % every === 0 && (
                  <text x={x + bw / 2} y={height - 8} textAnchor="middle" className="fill-[var(--muted)] text-[0.6875rem]">
                    {d.label}
                  </text>
                )}
                <rect
                  x={pad.l + i * band}
                  y={pad.t}
                  width={band}
                  height={ih}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${v == null ? "no data" : format(v)}`}
                  onMouseMove={() => setTip({ x: x + bw / 2, y: v == null ? y(0) : Math.min(y(v), y(0)), content: <ColTip d={d} format={format} /> })}
                  onFocus={() => setTip({ x: x + bw / 2, y: v == null ? y(0) : Math.min(y(v), y(0)), content: <ColTip d={d} format={format} /> })}
                  onBlur={() => setTip(null)}
                  className="cursor-default outline-none focus-visible:fill-[var(--accent-wash)]"
                />
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}

function ColTip({ d, format }: { d: Col; format: (v: number) => string }) {
  return (
    <div>
      <div className="tnum text-sm font-semibold text-ink">{d.value == null ? "No data" : format(d.value)}</div>
      <div className="text-ink-2">{d.label}</div>
      {d.detail && <div className="mt-0.5 text-muted">{d.detail}</div>}
    </div>
  );
}

export type HBar = { id: string; label: ReactNode; value: number; display: string; detail?: ReactNode; slot?: number; color?: string };

/** Ranked horizontal bars with the value at the tip. */
export function RankedBars({ data, diverging = false, slot = 1, labelWidth = 150 }: { data: HBar[]; diverging?: boolean; slot?: number; labelWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(1e-9, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = diverging && data.some((d) => d.value < 0);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-hbar]", { scaleX: 0, duration: 0.7, ease: "power3.out", stagger: 0.03 });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [data.length] },
  );
  return (
    <div ref={ref} className="space-y-1.5">
      {data.map((d) => {
        // the value sits in its own column, so a long label can never run outside the card
        const w = (Math.abs(d.value) / max) * (hasNeg ? 50 : 100);
        const color = d.color ?? (diverging ? (d.value >= 0 ? "var(--up)" : "var(--down)") : `var(--s${d.slot ?? slot})`);
        return (
          <div key={d.id} className="group grid min-w-0 items-center gap-3 rounded-md px-1 py-0.5 hover:bg-surface-2" style={{ gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(40px, 1fr) auto` }} title={typeof d.detail === "string" ? d.detail : undefined}>
            <div className="truncate text-[0.8125rem] text-ink-2">{d.label}</div>
            <div className="relative h-6 min-w-0">
              {hasNeg && <span aria-hidden className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--axis)]" />}
              <div
                data-hbar
                className="absolute top-1/2 h-3.5 -translate-y-1/2"
                style={{
                  width: `${Math.max(w, 0.6)}%`,
                  left: hasNeg ? (d.value >= 0 ? "50%" : `${50 - w}%`) : 0,
                  background: color,
                  borderRadius: hasNeg ? (d.value >= 0 ? "0 4px 4px 0" : "4px 0 0 4px") : "0 4px 4px 0",
                  transformOrigin: hasNeg ? (d.value >= 0 ? "left" : "right") : "left",
                }}
              />
            </div>
            <span className="tnum min-w-[64px] text-right text-xs font-medium whitespace-nowrap text-ink">{d.display}</span>
          </div>
        );
      })}
    </div>
  );
}
