"use client";

import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, sma } from "@/lib/analytics";
import { fmtDate, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { Frequency, Point } from "@/lib/types";
import { useThemeVars, withAlpha } from "./use-theme-vars";

export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";
export type ChartKind = "candles" | "line" | "area";
export type ChartMarker = { d: string; type: string; label?: string };

export function rangeStart(last: string, r: RangeKey) {
  switch (r) {
    case "1M":
      return addMonths(last, -1);
    case "3M":
      return addMonths(last, -3);
    case "6M":
      return addMonths(last, -6);
    case "1Y":
      return addMonths(last, -12);
    case "3Y":
      return addMonths(last, -36);
    case "5Y":
      return addMonths(last, -60);
    default:
      return "1900-01-01";
  }
}

const NO_MARKERS: ChartMarker[] = [];

type Readout = { d: string; v: number; o?: number; h?: number; l?: number; vol?: number; prev?: number; s?: number | null; lg?: number | null };

export function PriceChart({
  points,
  freq,
  unit,
  kind,
  range,
  showShort = true,
  showLong = true,
  showVolume = false,
  markers = NO_MARKERS,
  height = 400,
}: {
  points: Point[];
  freq: Frequency;
  unit: string;
  kind: ChartKind;
  range: RangeKey;
  showShort?: boolean;
  showLong?: boolean;
  showVolume?: boolean;
  markers?: ChartMarker[];
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [version, setVersion] = useState(0);
  const [hover, setHover] = useState<Readout | null>(null);
  const vars = useThemeVars();

  const data = useMemo(() => points.filter((p) => p.v != null) as (Point & { v: number })[], [points]);
  const ma = useMemo(() => {
    const vals = data.map((p) => p.v);
    return { s: sma(vals, freq === "daily" ? 20 : 3), l: sma(vals, freq === "daily" ? 50 : 12) };
  }, [data, freq]);
  const canCandle = kind === "candles" && data.length > 0 && data.every((p) => p.o != null && p.h != null && p.l != null);

  const lastReadout = useMemo<Readout | null>(() => {
    const n = data.length;
    if (!n) return null;
    const p = data[n - 1];
    return { d: p.d, v: p.v, o: p.o, h: p.h, l: p.l, vol: p.vol, prev: data[n - 2]?.v, s: ma.s[n - 1], lg: ma.l[n - 1] };
  }, [data, ma]);

  // Build the chart (rebuilt when data, style or theme change).
  useEffect(() => {
    if (!box.current || !vars || !data.length) return;
    const digits = Math.abs(data[data.length - 1].v) >= 1000 ? 0 : 2;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: vars["--muted"],
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: vars["--grid"], style: LineStyle.Solid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.06 } },
      timeScale: { borderVisible: false, rightOffset: 3, fixLeftEdge: true, fixRightEdge: false, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: vars["--axis"], width: 1, style: LineStyle.Solid, labelBackgroundColor: vars["--ink"] },
        horzLine: { color: vars["--axis"], width: 1, style: LineStyle.Solid, labelBackgroundColor: vars["--ink"] },
      },
      localization: { priceFormatter: (p: number) => fmtNum(p, { digits }) },
    });
    chartRef.current = chart;

    let main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area">;
    if (canCandle) {
      main = chart.addSeries(CandlestickSeries, {
        upColor: "transparent", // hollow up-candles: direction readable without colour
        downColor: vars["--down"],
        borderUpColor: vars["--up"],
        borderDownColor: vars["--down"],
        wickUpColor: vars["--up"],
        wickDownColor: vars["--down"],
        priceLineVisible: true,
        priceLineColor: vars["--axis"],
      });
      main.setData(data.map((p) => ({ time: p.d as Time, open: p.o!, high: p.h!, low: p.l!, close: p.v })));
    } else if (kind === "area") {
      main = chart.addSeries(AreaSeries, {
        lineColor: vars["--s1"],
        lineWidth: 2,
        topColor: withAlpha(vars["--s1"], 0.2),
        bottomColor: withAlpha(vars["--s1"], 0.01),
        priceLineColor: vars["--axis"],
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: vars["--surface"],
        crosshairMarkerBorderWidth: 2,
      });
      main.setData(data.map((p) => ({ time: p.d as Time, value: p.v })));
    } else {
      main = chart.addSeries(LineSeries, {
        color: vars["--s1"],
        lineWidth: 2,
        priceLineColor: vars["--axis"],
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: vars["--surface"],
        crosshairMarkerBorderWidth: 2,
        pointMarkersVisible: freq === "monthly" && data.length < 80,
      });
      main.setData(data.map((p) => ({ time: p.d as Time, value: p.v })));
    }

    if (showShort) {
      const s = chart.addSeries(LineSeries, { color: vars["--s2"], lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data.flatMap((p, i) => (ma.s[i] == null ? [] : [{ time: p.d as Time, value: ma.s[i]! }])));
    }
    if (showLong) {
      const s = chart.addSeries(LineSeries, { color: vars["--s7"], lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data.flatMap((p, i) => (ma.l[i] == null ? [] : [{ time: p.d as Time, value: ma.l[i]! }])));
    }
    if (showVolume && data.some((p) => p.vol)) {
      const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: withAlpha(vars["--muted"], 0.45), lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(data.map((p) => ({ time: p.d as Time, value: p.vol ?? 0 })));
    }

    if (markers.length) {
      const known = new Set(data.map((p) => p.d));
      const ms: SeriesMarker<Time>[] = markers
        .filter((m) => known.has(m.d))
        .sort((a, b) => (a.d < b.d ? -1 : 1))
        .map((m) => {
          const up = m.type === "cross-up" || m.type === "jump" || m.type === "high";
          return {
            time: m.d as Time,
            position: up ? "belowBar" : "aboveBar",
            shape: m.type.startsWith("cross") ? (up ? "arrowUp" : "arrowDown") : "circle",
            color: up ? vars["--up"] : vars["--down"],
            text: m.label,
            size: 1,
          };
        });
      createSeriesMarkers(main, ms);
    }

    const byTime = new Map(data.map((p, i) => [p.d, i]));
    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) return setHover(null);
      const i = byTime.get(param.time as string);
      if (i == null) return setHover(null);
      const p = data[i];
      setHover({ d: p.d, v: p.v, o: p.o, h: p.h, l: p.l, vol: p.vol, prev: data[i - 1]?.v, s: ma.s[i], lg: ma.l[i] });
    };
    chart.subscribeCrosshairMove(onMove);
    setVersion((v) => v + 1);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, ma, vars, kind, canCandle, showShort, showLong, showVolume, markers, freq]);

  // Apply the visible range.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data.length) return;
    const last = data[data.length - 1].d;
    const from = rangeStart(last, range);
    if (range === "MAX" || from <= data[0].d) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleRange({ from: from as Time, to: addDays(last, 1) as Time });
  }, [range, version, data]);

  const r = hover ?? lastReadout;
  const change = r && r.prev ? (r.v / r.prev - 1) * 100 : null;
  return (
    <div className="relative">
      <div className="pointer-events-none absolute top-0 left-0 z-10 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-2" aria-live="polite">
        {r && (
          <>
            <span className="font-medium text-ink">{fmtDate(r.d, freq === "monthly" ? "month" : "long")}</span>
            {canCandle && r.o != null ? (
              <span className="tnum">
                O <b className="font-medium text-ink">{fmtNum(r.o)}</b> H <b className="font-medium text-ink">{fmtNum(r.h)}</b> L <b className="font-medium text-ink">{fmtNum(r.l)}</b> C{" "}
                <b className="font-medium text-ink">{fmtNum(r.v)}</b>
              </span>
            ) : (
              <span className="tnum font-medium text-ink">{fmtPrice(r.v, unit)}</span>
            )}
            {change != null && (
              <span className={`tnum font-medium ${change > 0 ? "text-up-ink" : change < 0 ? "text-down-ink" : ""}`}>
                {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {fmtPct(change, 2)}
              </span>
            )}
            {showShort && r.s != null && (
              <span className="tnum inline-flex items-center gap-1">
                <i className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--s2)" }} />
                {freq === "daily" ? "20-day" : "3-month"} avg {fmtNum(r.s)}
              </span>
            )}
            {showLong && r.lg != null && (
              <span className="tnum inline-flex items-center gap-1">
                <i className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--s7)" }} />
                {freq === "daily" ? "50-day" : "12-month"} avg {fmtNum(r.lg)}
              </span>
            )}
          </>
        )}
      </div>
      <div className="pt-9">
        <div ref={box} style={{ height }} role="img" aria-label={`Price chart, ${data.length} points`} />
      </div>
    </div>
  );
}
