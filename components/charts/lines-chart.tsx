"use client";

import { createChart, CrosshairMode, LineSeries, LineStyle, type MouseEventParams, type Time } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtNum } from "@/lib/format";
import { useThemeVars } from "./use-theme-vars";

export type Line = { id: string; name: string; slot: number; points: { d: string; v: number }[] };

/** Several lines in the SAME unit on one axis (e.g. median ₹/kg asks per city). */
export function LinesChart({ lines, height = 260, unit = "₹/kg" }: { lines: Line[]; height?: number; unit?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const vars = useThemeVars();
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (!box.current || !vars) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: vars["--muted"], fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: vars["--grid"] } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: vars["--axis"], width: 1, style: LineStyle.Solid, labelBackgroundColor: vars["--ink"] }, horzLine: { visible: false, labelVisible: false } },
      localization: { priceFormatter: (p: number) => fmtNum(p, { digits: Math.abs(p) < 10 ? 2 : 0 }) },
    });
    for (const l of lines) {
      const s = chart.addSeries(LineSeries, { color: vars[`--s${l.slot}` as "--s1"], lineWidth: 2, priceLineVisible: false, pointMarkersVisible: l.points.length < 40, crosshairMarkerBorderColor: vars["--surface"] });
      s.setData(l.points.map((p) => ({ time: p.d as Time, value: p.v })));
    }
    chart.timeScale().fitContent();
    const onMove = (p: MouseEventParams<Time>) => setHover(p.time ? (p.time as string) : null);
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [lines, vars]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.8125rem]">
        <span className="text-xs text-muted">{hover ? fmtDate(hover, "long") : "Latest"}</span>
        {lines.map((l) => {
          const v = hover ? l.points.find((p) => p.d === hover)?.v : l.points.at(-1)?.v;
          return (
            <span key={l.id} className="inline-flex items-center gap-2">
              <i aria-hidden className="inline-block h-[3px] w-4 rounded-full" style={{ background: `var(--s${l.slot})` }} />
              <span className="text-ink-2">{l.name}</span>
              <b className="tnum font-semibold text-ink">{v == null ? "–" : `${unit.startsWith("$") ? "$" : "₹"}${fmtNum(v, { digits: v < 10 ? 2 : 0 })}`}</b>
            </span>
          );
        })}
        <span className="ml-auto text-xs text-muted">{unit}</span>
      </div>
      <div ref={box} style={{ height }} />
    </div>
  );
}
