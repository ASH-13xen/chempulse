"use client";

import { ArrowLeft, BookOpen, FileDown, GitCompareArrows, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addMonths, clean, corrLabel, indexAtOrBefore, rebase } from "@/lib/analytics";
import { categoryById, chemicalById, hrefFor, marketById } from "@/lib/catalog";
import type { Detail } from "@/lib/detail";
import { fmtDate, fmtNum, fmtPct, fmtTonnes, PERIOD_SHORT } from "@/lib/format";
import type { PeriodKey, Point, Quote } from "@/lib/types";
import { ColumnChart, RankedBars } from "../charts/bars";
import { IndexedChart, type IndexedLine } from "../charts/indexed-chart";
import { PriceChart, rangeStart, type ChartKind, type RangeKey } from "../charts/price-chart";
import { NewsList } from "../dashboard/dashboard";
import { useSettings } from "../providers/settings";
import { Card, DataTable } from "../ui/card";
import { CategoryDot, Change, FreqBadge, TrendBadge } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { CountUp, Reveal } from "../ui/motion";
import { RangeBar, StarButton } from "../ui/row-bits";
import { Segmented } from "../ui/segmented";
import type { ProductSummary } from "@/lib/seller-stats";
import { formatIn } from "../providers/money";
import { QuotesCard } from "./quotes-card";
import { SellerPricesCard } from "./seller-prices-card";

type Cur = "native" | "inr" | "usd";
type FxSeries = { d: string; v: number }[];

/** Converts a price series to ₹ or $ using each day's exchange rate. */
function convertSeries(points: Point[], unit: string, cur: Cur, cny: FxSeries, usd: FxSeries): { points: Point[]; unit: string } {
  const at = (fx: FxSeries, d: string) => {
    const i = indexAtOrBefore(fx, d);
    return i >= 0 ? fx[i].v : fx[0]?.v ?? null;
  };
  let factor: ((d: string) => number | null) | null = null;
  let out = unit;
  if (unit === "CNY/t" && cur === "inr") {
    factor = (d) => (at(cny, d) ?? NaN) / 1000;
    out = "₹/kg";
  } else if (unit === "CNY/t" && cur === "usd") {
    factor = (d) => (at(cny, d) ?? NaN) / (at(usd, d) ?? NaN) / 1000;
    out = "$/kg";
  } else if (unit === "₹/kg" && cur === "usd") {
    factor = (d) => 1 / (at(usd, d) ?? NaN);
    out = "$/kg";
  } else if (unit.startsWith("USD/") && cur === "inr") {
    factor = (d) => at(usd, d);
    out = `₹/${unit.slice(4)}`;
  } else if (unit.startsWith("USD/")) {
    out = `$/${unit.slice(4)}`;
  }
  if (!factor) return { points, unit: out };
  const f = factor;
  return {
    unit: out,
    points: points.map((p) => {
      const k = f(p.d);
      if (k == null || !Number.isFinite(k)) return { ...p, v: null };
      return { ...p, v: p.v == null ? null : p.v * k, o: p.o != null ? p.o * k : undefined, h: p.h != null ? p.h * k : undefined, l: p.l != null ? p.l * k : undefined };
    }),
  };
}

const RANGES: RangeKey[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];

export function ChemicalView({ detail, quotes, storage, sellerProducts = [] }: { detail: Detail; quotes: Quote[]; storage: "mongo" | "json"; sellerProducts?: ProductSummary[] }) {
  const { row } = detail;
  const chem = chemicalById[detail.id];
  const market = marketById[detail.id];
  const settings = useSettings();
  const cat = chem ? categoryById[chem.category] : null;
  const daily = row.frequency === "daily";
  const convertible = row.unit === "CNY/t" || row.unit === "₹/kg" || row.unit.startsWith("USD/");
  const [unitMode, setUnitMode] = useState<Cur | null>(null);
  const mode: Cur = unitMode ?? settings.prices;
  const [range, setRange] = useState<RangeKey>(daily ? "1Y" : "3Y");
  const [kind, setKind] = useState<ChartKind>(daily && row.unit === "CNY/t" ? "candles" : "area");
  const [avgs, setAvgs] = useState(true);
  const [signals, setSignals] = useState(true);
  const [volume, setVolume] = useState(false);

  const conv = useMemo(() => convertSeries(detail.primary, row.unit, mode, detail.fx, detail.fxUsd), [detail.primary, row.unit, mode, detail.fx, detail.fxUsd]);
  const points = conv.points;
  const unit = conv.unit;
  const lastV = points.filter((p) => p.v != null).at(-1)?.v ?? null;
  const hasOhlc = detail.primary.some((p) => p.o != null);

  const changeKeys: PeriodKey[] = daily ? ["d1", "w1", "m1", "m3", "y1", "ytd"] : ["m1", "m3", "m6", "y1", "ytd"];

  return (
    <Reveal className="space-y-6">
      {/* Header */}
      <div data-reveal className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <Link href={chem ? "/" : "/markets"} className="inline-flex items-center gap-1 hover:text-ink">
              <ArrowLeft className="size-3.5" /> {chem ? "Overview" : "Markets"}
            </Link>
            <span className="text-muted">/</span>
            {cat ? (
              <span className="inline-flex items-center gap-1.5">
                <CategoryDot slot={cat.slot} /> {cat.name}
              </span>
            ) : (
              <span>{market?.group}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink">{row.name}</h1>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-semibold text-ink-2">{row.short}</span>
            <FreqBadge frequency={row.frequency} />
            {row.isGroupData && <span className="rounded-md bg-[color-mix(in_oklab,var(--warn)_20%,transparent)] px-2 py-0.5 text-xs font-semibold text-ink-2">Broad customs group</span>}
            {row.noisy && !row.isGroupData && <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold text-ink-2">Noisy import price</span>}
            {chem ? <StarButton id={chem.id} name={chem.name} kind="chem" /> : market ? <StarButton id={market.id} name={market.name} kind="market" /> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
            <div>
              <div className="text-[34px] leading-none font-semibold tracking-tight text-ink">
                <CountUp value={lastV} format={(v) => formatIn(v, unit)} />
              </div>
              <div className="mt-1.5 text-xs text-muted">
                {daily ? "Close" : "Average import price"} · {fmtDate(row.lastDate, daily ? "long" : "month")} · {chem?.daily ? `China ${marketById[chem.daily].exchange.split(" ")[0]} futures` : market ? market.exchange : "Tradestat (India)"}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {changeKeys.map((k) => (
                <div key={k} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center">
                  <div className="text-[10px] font-semibold tracking-wide text-muted uppercase">{PERIOD_SHORT[k]}</div>
                  <Change value={row.changes[k]} size="sm" />
                </div>
              ))}
            </div>
            <TrendBadge dir={row.trend.dir} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-noprint>
          {convertible && (
            <Segmented
              ariaLabel="Currency"
              value={mode}
              onChange={(v) => setUnitMode(v)}
              options={[
                { value: "inr", label: row.unit.startsWith("USD/") ? `₹ / ${row.unit.slice(4)}` : "₹ / kg" },
                { value: "usd", label: row.unit.startsWith("USD/") ? `$ / ${row.unit.slice(4)}` : "$ / kg" },
                ...(row.unit === "CNY/t" ? [{ value: "native" as Cur, label: "¥ / tonne" }] : []),
              ]}
            />
          )}
          <Link href={`/compare?s=${[detail.id, ...detail.drivers.map((d) => d.id)].slice(0, 4).join(",")}`} className="btn">
            <GitCompareArrows className="size-4" /> Compare
          </Link>
          <button type="button" className="btn" onClick={() => window.print()}>
            <FileDown className="size-4" /> PDF
          </button>
        </div>
      </div>

      {chem?.hsNote && (
        <div data-reveal className="rounded-xl border border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-4 py-3 text-[13px] text-ink-2">
          <b className="text-ink">About this data:</b> {chem.hsNote}
        </div>
      )}

      {/* Chart + side panel */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={daily ? (chem ? `${marketById[chem.daily!]?.name ?? "Price"}` : row.name) : "India import price"}
          subtitle={daily ? `${unit !== row.unit && row.unit === "CNY/t" ? `Converted to ≈ ${unit} at each day's exchange rate` : unit} · daily` : `${unit === "$/kg" ? "US$" : "₹"} per kg, customs value ÷ quantity · monthly`}
          info={
            <>
              <p>{daily ? "Each candle is one trading day: hollow = closed higher than it opened, filled = closed lower." : "Average price India paid for imports each month. Months with very small shipments are hidden because their average is misleading."}</p>
              <p>
                The orange line is the {daily ? "20-day" : "3-month"} average and the violet line the {daily ? "50-day" : "12-month"} average. When orange crosses above violet, the trend has turned up.
              </p>
              <p>Arrows and dots mark detected signals. Scroll or pinch to zoom; drag to pan.</p>
            </>
          }
          exportName={`${detail.id}-price`}
          csv={() => ({
            header: ["Date", "Value", "Open", "High", "Low", "Volume", "Unit"],
            rows: points.filter((p) => p.v != null && p.d >= rangeStart(row.lastDate ?? "2100-01-01", range)).map((p) => [p.d, p.v?.toFixed(4), p.o?.toFixed(4), p.h?.toFixed(4), p.l?.toFixed(4), p.vol, unit]),
          })}
          table={() => (
            <DataTable
              header={["Date", "Price"]}
              rows={points
                .filter((p) => p.v != null)
                .slice(-120)
                .reverse()
                .map((p) => [fmtDate(p.d, daily ? "long" : "month"), formatIn(p.v, unit)])}
            />
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2" data-noexport="true">
            <Segmented ariaLabel="Chart range" size="sm" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r === "MAX" ? "Max" : r, disabled: !daily && (r === "1M" || r === "3M") }))} />
            {daily && (
              <Segmented
                ariaLabel="Chart style"
                size="sm"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "candles", label: "Candles", disabled: !hasOhlc },
                  { value: "line", label: "Line" },
                  { value: "area", label: "Area" },
                ]}
              />
            )}
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button type="button" className="chip h-7! text-xs!" data-on={avgs} onClick={() => setAvgs(!avgs)}>
                Averages
              </button>
              <button type="button" className="chip h-7! text-xs!" data-on={signals} onClick={() => setSignals(!signals)}>
                Signals
              </button>
              {daily && hasOhlc && (
                <button type="button" className="chip h-7! text-xs!" data-on={volume} onClick={() => setVolume(!volume)}>
                  Volume
                </button>
              )}
            </div>
          </div>
          <PriceChart points={points} freq={row.frequency} unit={unit} kind={daily ? kind : "area"} range={range} showShort={avgs} showLong={avgs} showVolume={volume} markers={signals ? detail.markers : []} height={420} />
        </Card>

        <div className="space-y-6">
          <Card title="Key numbers" png={false} info={<p>Numbers measured on {daily ? "daily closing prices" : "monthly import prices"}.</p>}>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="mb-1.5 flex items-center gap-1 text-ink-2">
                  {daily ? "52-week range" : "12-month range"}
                  <InfoTip title="Range">
                    <p>The dot shows where the latest price sits between the lowest and highest price of the last {daily ? "52 weeks" : "12 months"}.</p>
                  </InfoTip>
                </dt>
                <dd>
                  <RangeBar pos={row.rangePos} lo={row.lo52} hi={row.hi52} unit={row.unit} />
                </dd>
              </div>
              <Stat label={`Typical ${daily ? "daily" : "monthly"} move`} value={row.typicalMove == null ? "–" : `±${row.typicalMove.toFixed(2)}%`} info={`How much the price usually moves in one ${daily ? "trading day" : "month"} (standard deviation of the last ${daily ? "90 days" : "24 months"}). Bigger = more volatile.`} />
              <Stat label="Worst fall in the last year" value={detail.drawdown1y == null ? "–" : fmtPct(detail.drawdown1y)} info="The largest drop from a peak to a later low within the last 12 months." />
              <Stat
                label="Trend strength"
                value={row.momentum == null ? "–" : `${row.momentum > 0 ? "+" : ""}${row.momentum.toFixed(2)}`}
                info={`The ${daily ? "1-month" : "3-month"} change divided by its typical move. Above +1 = a strong rise for this chemical, below −1 = a strong fall. Lets you compare calm and volatile chemicals fairly.`}
              />
              <Stat label="Trend since" value={row.trend.since ? fmtDate(row.trend.since, daily ? "long" : "month") : "–"} info="When the current trend direction (up, down or sideways) began." />
              {chem && <Stat label="CAS · HS" value={`${chem.cas || "—"} · ${chem.hs.join(", ")}`} info="CAS identifies the chemical. HS is India's customs code used for the import data." />}
            </dl>
          </Card>
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="size-4 text-[var(--warn)]" /> What&apos;s happening
              </span>
            }
            png={false}
            info={<p>Plain-English observations generated from the numbers on this page. They describe the data; they are not advice.</p>}
          >
            <ul className="space-y-2.5 text-sm text-ink-2">
              {detail.insights.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {sellerProducts.length > 0 && <SellerPricesCard products={sellerProducts} />}

      {detail.drivers.length > 0 && <DriversCard detail={detail} />}
      {detail.kind === "chemical" && <ImportsSection detail={detail} />}

      <div className="grid gap-6 xl:grid-cols-2">
        <SeasonalityCard detail={detail} />
        {detail.kind === "chemical" ? (
          <Card title="Related news" subtitle="Last 30 days" png={false}>
            <NewsList items={detail.news} />
          </Card>
        ) : (
          <Card title="Used as a signal for" png={false} info={<p>Chemicals on this site whose price this market helps explain.</p>}>
            {detail.usedBy.length ? (
              <ul className="flex flex-wrap gap-2">
                {detail.usedBy.map((u) => (
                  <li key={u.id}>
                    <Link href={hrefFor(u.id)} className="chip">
                      {u.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">A general cost and currency signal.</p>
            )}
            <p className="mt-4 text-sm text-ink-2">{market?.about}</p>
          </Card>
        )}
      </div>

      {chem && <QuotesCard chem={chem} quotes={quotes} storage={storage} lastPrice={row.imports?.price ?? null} />}

      {chem && (
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <BookOpen className="size-4 text-accent-ink" /> About {chem.name}
            </span>
          }
          png={false}
        >
          <div className="grid gap-6 text-sm text-ink-2 md:grid-cols-3">
            <p className="md:col-span-2">{chem.about}</p>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-4">
                <dt>CAS number</dt>
                <dd className="font-medium text-ink">{chem.cas || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>HS code(s)</dt>
                <dd className="font-medium text-ink">{chem.hs.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Daily signal</dt>
                <dd className="text-right font-medium text-ink">{chem.daily ? marketById[chem.daily].name : "None (monthly only)"}</dd>
              </div>
              {chem.density && (
                <div className="flex justify-between gap-4">
                  <dt>Density</dt>
                  <dd className="font-medium text-ink">{chem.density} kg/L</dd>
                </div>
              )}
            </dl>
          </div>
        </Card>
      )}
    </Reveal>
  );
}

function Stat({ label, value, info }: { label: string; value: string; info: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1 text-ink-2">
        {label}
        <InfoTip title={label}>
          <p>{info}</p>
        </InfoTip>
      </dt>
      <dd className="tnum text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function DriversCard({ detail }: { detail: Detail }) {
  const [win, setWin] = useState<"6M" | "1Y" | "3Y" | "5Y">("1Y");
  const s = clean(detail.primary);
  const last = s.at(-1)?.d ?? "2100-01-01";
  const start = addMonths(last, win === "6M" ? -6 : win === "1Y" ? -12 : win === "3Y" ? -36 : -60);
  const lines: IndexedLine[] = useMemo(
    () => [
      { id: detail.id, name: detail.row.frequency === "daily" ? detail.row.name : `${detail.row.name} (import price)`, slot: 1, points: rebase(s, start) },
      ...detail.drivers.map((d, i) => ({ id: d.id, name: d.name, slot: i + 2, points: rebase(d.points.filter((p) => p.d <= last), start) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, win],
  );
  return (
    <Card
      title="Price vs its drivers"
      subtitle={`All lines start at 100 on ${fmtDate(start, "long")}, so you can compare % moves`}
      info={
        <>
          <p>Each line shows how much a series has risen or fallen since the start of the window (100 = no change, 110 = +10%). This lets ¥/t, $/barrel and ₹/kg share one scale.</p>
          <p>The table shows how closely they move together. 1.00 = always the same direction, 0 = no link, negative = opposite.</p>
        </>
      }
      exportName={`${detail.id}-vs-drivers`}
      csv={() => {
        const dates = [...new Set(lines.flatMap((l) => l.points.map((p) => p.d)))].sort();
        const maps = lines.map((l) => new Map(l.points.map((p) => [p.d, p.v])));
        return { header: ["Date", ...lines.map((l) => `${l.name} (index)`)], rows: dates.map((d) => [d, ...maps.map((m) => m.get(d)?.toFixed(2) ?? "")]) };
      }}
      actions={<Segmented ariaLabel="Window" size="sm" value={win} onChange={setWin} options={(["6M", "1Y", "3Y", "5Y"] as const).map((v) => ({ value: v, label: v }))} />}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IndexedChart lines={lines} height={320} monthly={detail.row.frequency === "monthly"} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">How closely they move (last 3 years)</div>
          <ul className="divide-y divide-[var(--line)]">
            {detail.driverLinks.map((l) => (
              <li key={l.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">{l.name}</span>
                  <span className="tnum text-sm font-semibold text-ink">{l.r == null ? "–" : l.r.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="relative h-1.5 flex-1 rounded-full bg-[var(--surface-3)]">
                    <span aria-hidden className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--axis)]" />
                    {l.r != null && (
                      <span
                        className="absolute top-0 bottom-0 rounded-full"
                        style={{ background: l.r >= 0 ? "var(--s1)" : "var(--s2)", left: l.r >= 0 ? "50%" : `${50 + l.r * 50}%`, width: `${Math.abs(l.r) * 50}%` }}
                      />
                    )}
                  </div>
                  <span className="w-40 text-right text-xs text-ink-2">{corrLabel(l.r)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {l.basis} changes · {l.n} {l.basis === "weekly" ? "weeks" : "months"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function ImportsSection({ detail }: { detail: Detail }) {
  const { prices } = useSettings();
  const impConv = useMemo(() => convertSeries(detail.imports, "₹/kg", prices, detail.fx, detail.fxUsd), [detail.imports, prices, detail.fx, detail.fxUsd]);
  const [originView, setOriginView] = useState<"ytd" | "month">("ytd");
  const raw = detail.importsRaw.filter((p) => p.q != null);
  const last24 = raw.slice(-24);
  const priced = detail.imports.filter((p) => p.v != null);
  const o = detail.origins[0];
  const rows = o?.rows ?? [];
  const key = originView === "ytd" ? "qYtd" : "q";
  const total = rows.reduce((a, r) => a + (r[key] ?? 0), 0);
  const top = rows
    .filter((r) => r[key] > 0 && total > 0 && r[key] / total >= 0.01) // under 1% goes into "All others"
    .sort((a, b) => b[key] - a[key])
    .slice(0, 8);
  const rest = total - top.reduce((a, r) => a + r[key], 0);
  const origins = [
    ...top.map((r) => ({ id: r.country, label: prettyCountryClient(r.country), value: (r[key] / total) * 100, display: `${((r[key] / total) * 100).toFixed(0)}% · ${fmtTonnes(r[key] / 1000)}` })),
    ...(rest > 0 && total > 0 ? [{ id: "other", label: "All others", value: (rest / total) * 100, display: `${((rest / total) * 100).toFixed(0)}% · ${fmtTonnes(rest / 1000)}`, color: "var(--muted)" }] : []),
  ];
  const monthLabel = (d: string) => `${fmtDate(d, "month").slice(0, 3)} ${d.slice(2, 4)}`;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {detail.row.frequency === "daily" && (
        <Card
          title="India import price"
          subtitle={`${impConv.unit === "$/kg" ? "US$" : "₹"} per kg, monthly average of customs values`}
          info={<p>What India actually paid per kg of imports each month (customs value ÷ quantity). Months with tiny shipments are hidden. Compare with the China futures price above: imports usually follow with a lag of a few weeks.</p>}
          exportName={`${detail.id}-import-price`}
          csv={() => ({ header: ["Month", "Import price (Rs/kg)", "Quantity (t)", "Value (Rs crore)"], rows: raw.map((p) => [p.d.slice(0, 7), detail.imports.find((x) => x.d === p.d)?.v?.toFixed(2) ?? "", ((p.q ?? 0) / 1000).toFixed(1), p.val]) })}
        >
          {priced.length > 1 ? <PriceChart points={impConv.points} freq="monthly" unit={impConv.unit} kind="area" range="MAX" showShort={false} showLong={false} height={240} /> : <p className="text-sm text-ink-2">Not enough import months with meaningful volume.</p>}
        </Card>
      )}
      <Card
        className={detail.row.frequency === "daily" ? "" : "xl:col-span-2"}
        title="India import volume"
        subtitle="Tonnes per month, last 24 months"
        info={<p>How much India imported each month (DGCI&S data via Tradestat). Rising volume often signals rising demand or a domestic supply gap; falling volume can mean weak demand or more local production.</p>}
        exportName={`${detail.id}-import-volume`}
        csv={() => ({ header: ["Month", "Quantity (t)", "Value (Rs crore)"], rows: raw.map((p) => [p.d.slice(0, 7), ((p.q ?? 0) / 1000).toFixed(1), p.val]) })}
        table={() => <DataTable header={["Month", "Tonnes", "₹ crore"]} rows={[...last24].reverse().map((p) => [fmtDate(p.d, "month"), fmtNum((p.q ?? 0) / 1000, { digits: 0 }), fmtNum(p.val ?? 0)])} />}
      >
        <ColumnChart
          data={last24.map((p) => ({ label: monthLabel(p.d), value: (p.q ?? 0) / 1000, detail: fmtDate(p.d, "month") }))}
          format={(v) => fmtTonnes(v)}
          axisFormat={(v) => (v >= 1000 ? `${fmtNum(v / 1000, { digits: 0 })}k` : fmtNum(v, { digits: 0 }))}
          height={detail.row.frequency === "daily" ? 240 : 280}
          capLabels={false}
        />
      </Card>
      <Card
        title="Supplier countries"
        subtitle={o ? `${originView === "ytd" ? "Financial year to" : "Month of"} ${fmtDate(o.month + "-01", "month")}` : "No origin data yet"}
        info={<p>Share of India&apos;s import volume by country of origin. A shift between suppliers (for example China replacing Korea) can change prices and lead times.</p>}
        exportName={`${detail.id}-origins`}
        csv={() => ({ header: ["Country", "Month qty (t)", "FYTD qty (t)", "Month value (Rs cr)", "FYTD value (Rs cr)"], rows: rows.map((r) => [prettyCountryClient(r.country), (r.q / 1000).toFixed(1), (r.qYtd / 1000).toFixed(1), r.val, r.valYtd]) })}
        actions={
          <Segmented
            ariaLabel="Origin period"
            size="sm"
            value={originView}
            onChange={setOriginView}
            options={[
              { value: "ytd", label: "FY to date" },
              { value: "month", label: "Month" },
            ]}
          />
        }
      >
        {origins.length ? <RankedBars data={origins} labelWidth={96} /> : <p className="text-sm text-ink-2">No imports recorded for this period.</p>}
      </Card>
    </div>
  );
}

function prettyCountryClient(c: string) {
  const map: Record<string, string> = { "China P Rp": "China", "Korea Rp": "South Korea", "U Arab Emts": "UAE", "U S A": "USA", "Saudi Arab": "Saudi Arabia", "U K": "UK", Netherland: "Netherlands" };
  return map[c] ?? c;
}

function SeasonalityCard({ detail }: { detail: Detail }) {
  const years = Math.max(0, ...detail.seasonal.map((m) => m.n));
  return (
    <Card
      title="Seasonal pattern"
      subtitle={`Average change by calendar month${years ? `, ${years} years of data` : ""}`}
      info={
        <>
          <p>For each month, the average % change from the end of the previous month, across all years available. Useful for timing purchases around recurring seasons (monsoon, rabi, year-end destocking).</p>
          <p>Past patterns can break; treat this as a hint, not a forecast.</p>
        </>
      }
      exportName={`${detail.id}-seasonality`}
      csv={() => ({ header: ["Month", "Average change %", "Years rising", "Years counted"], rows: detail.seasonal.map((m) => [m.month, m.avg?.toFixed(2) ?? "", m.up, m.n]) })}
      table={() => <DataTable header={["Month", "Avg change", "Rising years"]} rows={detail.seasonal.map((m) => [m.month, fmtPct(m.avg), `${m.up} of ${m.n}`])} />}
    >
      <ColumnChart diverging data={detail.seasonal.map((m) => ({ label: m.month, value: m.avg, detail: m.n ? `Rose in ${m.up} of ${m.n} years` : "No data" }))} format={(v) => fmtPct(v)} axisFormat={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} height={240} />
    </Card>
  );
}
