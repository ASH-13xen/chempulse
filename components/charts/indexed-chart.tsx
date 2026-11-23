"use client";

import { createChart, CrosshairMode, LineSeries, LineStyle, type IChartApi, type MouseEventParams, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtNum } from "@/lib/format";
import { useThemeVars } from "./use-theme-vars";

export type IndexedLine = { id: string; name: string; slot: number; points: { d: string; v: number }[] };

/**
 * Several series on ONE axis, each rebased to 100 at the start of the window,
 * so different units (¥/t, $/bbl, ₹/kg) compare fairly. Never two y-axes.
 */
export function IndexedChart({ lines, height = 340, monthly = false }: { lines: IndexedLine[]; height?: number; monthly?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const vars = useThemeVars();
  const [hoverD, setHoverD] = useState<string | null>(null);

  const lookup = useMemo(() => lines.map((l) => new Map(l.points.map((p) => [p.d, p.v]))), [lines]);

  useEffect(() => {
    if (!box.current || !vars) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: vars["--muted"], fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: vars["--grid"] } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.06 } },
      timeScale: { borderVisible: false, rightOffset: 2, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: vars["--axis"], width: 1, style: LineStyle.Solid, labelBackgroundColor: vars["--ink"] },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: { priceFormatter: (p: number) => fmtNum(p, { digits: 0 }) },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;
    lines.forEach((l, i) => {
      const s = chart.addSeries(LineSeries, {
        color: vars[`--s${l.slot}` as "--s1"],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: vars["--surface"],
        crosshairMarkerBorderWidth: 2,
        pointMarkersVisible: monthly && l.points.length < 60,
      });
      s.setData(l.points.map((p) => ({ time: p.d as Time, value: p.v })));
      if (i === 0) s.createPriceLine({ price: 100, color: vars["--axis"], lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    });
    chart.timeScale().fitContent();
    const onMove = (p: MouseEventParams<Time>) => setHoverD(p.time ? (p.time as string) : null);
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [lines, vars, monthly]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]" aria-live="polite">
        <span className="text-xs text-muted">{hoverD ? fmtDate(hoverD, monthly ? "month" : "long") : "Latest"}</span>
        {lines.map((l, i) => {
          const v = hoverD ? lookup[i].get(hoverD) : l.points.at(-1)?.v;
          return (
            <span key={l.id} className="inline-flex items-center gap-2">
              <i aria-hidden className="inline-block h-[3px] w-4 rounded-full" style={{ background: `var(--s${l.slot})` }} />
              <span className="text-ink-2">{l.name}</span>
              <b className={`tnum font-semibold ${v == null ? "text-muted" : v >= 100 ? "text-up-ink" : "text-down-ink"}`}>
                {v == null ? "–" : `${v >= 100 ? "+" : "−"}${Math.abs(v - 100).toFixed(1)}%`}
              </b>
            </span>
          );
        })}
      </div>
      <div ref={box} style={{ height }} role="img" aria-label={`Comparison of ${lines.map((l) => l.name).join(", ")}, rebased to 100`} />
    </div>
  );
}
