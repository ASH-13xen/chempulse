"use client";

import { ArrowDownRight, ArrowUpRight, FileDown, Flame, Newspaper, Ship, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categories, categoryById, hrefFor } from "@/lib/catalog";
import { fmtAgo, fmtDate, fmtPct, fmtTonnes, PERIOD_LABEL } from "@/lib/format";
import type { Board, NewsItem, PeriodKey, Row, SignalEvent } from "@/lib/types";
import { RankedBars } from "../charts/bars";
import { Card, StatTile } from "../ui/card";
import { CategoryDot, Change, FreqBadge, TrendBadge } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { CountUp, Reveal } from "../ui/motion";
import { useWatchlist } from "../providers/watchlist";
import { PriceText, RangeBar, StarButton } from "../ui/row-bits";
import { Segmented } from "../ui/segmented";
import { Sparkline } from "../ui/sparkline";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "w1", label: "1W" },
  { value: "m1", label: "1M" },
  { value: "m3", label: "3M" },
  { value: "m6", label: "6M" },
  { value: "y1", label: "1Y" },
];

/** For monthly-only chemicals a 1-week change does not exist; fall back to their latest month. */
function changeFor(r: Row, p: PeriodKey) {
  const v = r.changes[p];
  if (v == null && p === "w1" && r.frequency === "monthly") return null;
  return v;
}

export function Dashboard({ board, news }: { board: Board; news: NewsItem[] }) {
  const [period, setPeriod] = useState<PeriodKey>("m1");
  const chems = useMemo(() => board.rows.filter((r) => r.type === "chemical"), [board.rows]);
  const withChange = chems.filter((r) => r.rankable && changeFor(r, period) != null);
  const sorted = [...withChange].sort((a, b) => changeFor(b, period)! - changeFor(a, period)!);
  const risers = sorted.filter((r) => changeFor(r, period)! > 0).slice(0, 6);
  const fallers = [...sorted].reverse().filter((r) => changeFor(r, period)! < 0).slice(0, 6);
  const up = chems.filter((r) => r.trend.dir === "up").length;
  const down = chems.filter((r) => r.trend.dir === "down").length;
  const recentSignals = board.events.filter((e) => e.type !== "import-surge" && e.type !== "import-slump");
  const latestEventDate = recentSignals[0]?.d;
  const weekAgo = latestEventDate ? new Date(Date.parse(latestEventDate) - 7 * 86400000).toISOString().slice(0, 10) : "";
  const unusualCount = recentSignals.filter((e) => (e.type === "jump" || e.type === "drop") && e.d >= weekAgo).length;
  const biggest = [...withChange].sort((a, b) => Math.abs(changeFor(b, period)!) - Math.abs(changeFor(a, period)!))[0];

  const catBars = categories
    .map((c) => {
      const members = chems.filter((r) => r.rankable && r.category === c.id && changeFor(r, period) != null);
      if (!members.length) return null;
      const avg = members.reduce((s, r) => s + changeFor(r, period)!, 0) / members.length;
      return { id: c.id, label: c.name, value: avg, display: fmtPct(avg), slot: c.slot, n: members.length };
    })
    .filter(Boolean)
    .sort((a, b) => b!.value - a!.value) as { id: string; label: string; value: number; display: string; slot: number; n: number }[];

  const drivers = ["brent", "propane", "henryhub", "usdinr", "cnyinr"].map((id) => board.rows.find((r) => r.id === id)).filter(Boolean) as Row[];
  const importMovers = chems
    .filter((r) => r.imports?.qtyYoY != null && (r.imports?.qtyT ?? 0) >= 100 && !r.isGroupData)
    .sort((a, b) => Math.abs(b.imports!.qtyYoY!) - Math.abs(a.imports!.qtyYoY!))
    .slice(0, 6);
  const importMonth = chems.find((r) => r.imports)?.imports?.month;

  return (
    <Reveal className="space-y-6">
      {/* Header */}
      <div data-reveal className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-6 sm:px-8">
        <div aria-hidden className="hero-grid absolute inset-0 opacity-60" />
        <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-accent-ink">
              <span className="live-dot" /> Market overview
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">What is moving in chemicals</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              {chems.length} chemicals and {board.rows.length - chems.length} driver markets. Latest China close {fmtDate(board.asOf, "long")}; India imports to {fmtDate(importMonth, "month")}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-noexport="true" data-noprint>
            <div data-tour="period" className="flex items-center gap-2">
              <span className="text-xs text-ink-2">Window</span>
              <Segmented ariaLabel="Time window" value={period} onChange={setPeriod} options={PERIODS} />
              <InfoTip title="Time window">
                <p>Changes, rankings and category bars below are measured over this window, from the latest price back.</p>
                <p>Chemicals that only have monthly (import) data show “–” for one week.</p>
              </InfoTip>
            </div>
            <button type="button" className="btn" onClick={() => window.print()}>
              <FileDown className="size-4" /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div data-tour="tiles" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="In an uptrend"
          value={<CountUp value={up} format={(v) => `${Math.round(v)}`} />}
          sub={<span>of {chems.length} chemicals</span>}
          tone="up"
          info={<p>Chemicals whose short-term average price is above the long-term average (20 vs 50 trading days for daily prices, 3 vs 12 months for monthly import prices).</p>}
        />
        <StatTile label="In a downtrend" value={<CountUp value={down} format={(v) => `${Math.round(v)}`} />} sub={<span>{chems.length - up - down} moving sideways</span>} tone="down" info={<p>Short-term average below the long-term average. Sideways means the two averages are close together.</p>} />
        <StatTile
          label="Unusual moves"
          value={<CountUp value={unusualCount} format={(v) => `${Math.round(v)}`} />}
          sub={<span>in the last 7 days</span>}
          info={<p>A day (or month) where the price moved at least 2.5× (2× for monthly) its typical move. These often mark news, outages or a turn in the market.</p>}
        />
        <StatTile
          label={`Biggest move · ${PERIOD_LABEL[period]}`}
          value={biggest ? <Change value={changeFor(biggest, period)} size="lg" className="text-[28px]!" /> : "–"}
          sub={
            biggest ? (
              <Link href={hrefFor(biggest.id)} className="font-medium text-ink hover:text-accent-ink hover:underline">
                {biggest.name}
              </Link>
            ) : null
          }
          info={
            <>
              <p>The chemical with the largest rise or fall over the selected window.</p>
              <p>Chemicals marked Noisy or Group are left out of rankings: their monthly import price swings with shipment size or product mix, not with the market.</p>
            </>
          }
        />
      </div>

      {/* Movers + categories */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          tour="movers"
          className="xl:col-span-3"
          title="Biggest movers"
          subtitle={`Ranked by change over ${PERIOD_LABEL[period].toLowerCase()}`}
          info={<p>Top risers and fallers among all chemicals. The small line shows the recent path; click a row for the full chart.</p>}
          csv={() => ({ header: ["Chemical", "Change %", "Price", "Unit"], rows: sorted.map((r) => [r.name, changeFor(r, period)?.toFixed(2), r.last, r.unit]) })}
          exportName={`biggest-movers-${period}`}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <MoverList title="Rising" icon={<ArrowUpRight className="size-4 text-up-ink" />} rows={risers} period={period} />
            <MoverList title="Falling" icon={<ArrowDownRight className="size-4 text-down-ink" />} rows={fallers} period={period} />
          </div>
        </Card>
        <Card
          className="xl:col-span-2"
          title="Category pulse"
          subtitle="Average change per category"
          info={<p>The average change of all chemicals in each category over the window. A quick way to see whether a move is one chemical or a whole sector.</p>}
          csv={() => ({ header: ["Category", "Average change %", "Chemicals counted"], rows: catBars.map((c) => [c.label, c.value.toFixed(2), c.n]) })}
          exportName={`category-pulse-${period}`}
        >
          {catBars.length ? <RankedBars data={catBars.map((c) => ({ ...c, label: <span className="inline-flex items-center gap-2"><CategoryDot slot={c.slot} />{c.label}</span> }))} diverging labelWidth={170} /> : <p className="text-sm text-ink-2">No data for this window.</p>}
        </Card>
      </div>

      {/* Signals + drivers */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          tour="signals"
          className="xl:col-span-3"
          title="Latest signals"
          subtitle="Spotted automatically from the price history"
          info={
            <>
              <p><b>Trend turned up/down</b>: the short-term average crossed the long-term average.</p>
              <p><b>New high/low</b>: highest or lowest price in 52 weeks (3 years for monthly data).</p>
              <p><b>Jumped/Fell</b>: a move much larger than usual for that chemical.</p>
            </>
          }
          actions={
            <Link href="/alerts" className="text-[13px] font-medium text-accent-ink hover:underline">
              All signals →
            </Link>
          }
        >
          <SignalList events={recentSignals.slice(0, 7)} />
        </Card>
        <Card className="xl:col-span-2" title="Cost drivers" subtitle="Energy and currency behind most chemical prices" info={<p>Crude oil, propane and natural gas feed most petrochemicals. The rupee rate changes what India pays for every import.</p>}>
          <ul className="divide-y divide-[var(--line)]">
            {drivers.map((r) => (
              <li key={r.id}>
                <Link href={hrefFor(r.id)} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                    <div className="text-xs text-muted">as of {fmtDate(r.lastDate)}</div>
                  </div>
                  <Sparkline values={r.spark} width={90} height={30} />
                  <div className="w-28 text-right">
                    <PriceText row={r} className="block text-sm font-medium text-ink" />
                    <Change value={changeFor(r, period)} size="xs" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Grid of chemicals */}
      <ChemicalGrid rows={chems} period={period} />

      {/* Imports + news */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <Ship className="size-4 text-accent-ink" /> India imports, {fmtDate(importMonth, "month")}
            </span>
          }
          subtitle="Biggest changes in import volume vs a year earlier"
          info={<p>From India&apos;s official monthly trade data (Tradestat). Rising imports usually mean rising demand or a domestic shortfall; falling imports can mean weak demand or more local supply.</p>}
          actions={
            <Link href="/imports" className="text-[13px] font-medium text-accent-ink hover:underline">
              Imports →
            </Link>
          }
        >
          <RankedBars
            diverging
            labelWidth={190}
            data={importMovers.map((r) => ({ id: r.id, label: r.name, value: r.imports!.qtyYoY!, display: `${fmtPct(r.imports!.qtyYoY, 0)} · ${fmtTonnes(r.imports!.qtyT)}` }))}
          />
        </Card>
        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <Newspaper className="size-4 text-accent-ink" /> Latest news
            </span>
          }
          actions={
            <Link href="/news" className="text-[13px] font-medium text-accent-ink hover:underline">
              All news →
            </Link>
          }
          png={false}
        >
          <NewsList items={news.slice(0, 7)} />
        </Card>
      </div>
    </Reveal>
  );
}

function MoverList({ title, icon, rows, period }: { title: string; icon: React.ReactNode; rows: Row[]; period: PeriodKey }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        {icon} {title}
      </div>
      {rows.length === 0 && <p className="py-6 text-sm text-ink-2">None in this window.</p>}
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={hrefFor(r.id)} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
              <CategoryDot slot={categoryById[r.category!].slot} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink group-hover:text-accent-ink">{r.name}</div>
                <PriceText row={r} className="text-xs text-muted" />
              </div>
              <Sparkline values={r.spark} width={70} height={26} animate={false} />
              <Change value={changeFor(r, period)} pill className="w-[76px] justify-end" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EVENT_ICON: Record<SignalEvent["type"], { icon: React.ReactNode; label: string }> = {
  "cross-up": { icon: <ArrowUpRight className="size-4 text-up-ink" />, label: "Trend up" },
  "cross-down": { icon: <ArrowDownRight className="size-4 text-down-ink" />, label: "Trend down" },
  high: { icon: <Flame className="size-4 text-up-ink" />, label: "New high" },
  low: { icon: <Flame className="size-4 rotate-180 text-down-ink" />, label: "New low" },
  jump: { icon: <Zap className="size-4 text-up-ink" />, label: "Jump" },
  drop: { icon: <Zap className="size-4 text-down-ink" />, label: "Drop" },
  "import-surge": { icon: <Ship className="size-4 text-up-ink" />, label: "Import surge" },
  "import-slump": { icon: <Ship className="size-4 text-down-ink" />, label: "Import slump" },
};

export function SignalList({ events }: { events: SignalEvent[] }) {
  if (!events.length) return <p className="py-6 text-sm text-ink-2">No signals in the last 30 days.</p>;
  return (
    <ul className="space-y-1">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={hrefFor(e.rowId)} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 group-hover:bg-surface">{EVENT_ICON[e.type].icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-ink group-hover:text-accent-ink">{e.name}</span>
                <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold tracking-wide text-ink-2 uppercase">{EVENT_ICON[e.type].label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{fmtDate(e.d)}</span>
              </div>
              <p className="text-[13px] text-ink-2">{e.text}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NewsList({ items }: { items: NewsItem[] }) {
  if (!items.length) return <p className="py-6 text-sm text-ink-2">No headlines yet. The collector reads news every 6 hours.</p>;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((n) => (
        <li key={n.id}>
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block py-2.5">
            <div className="line-clamp-2 text-sm font-medium text-ink group-hover:text-accent-ink">{n.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {n.source} · <NewsAgo iso={n.published} />
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function NewsAgo({ iso }: { iso: string }) {
  const [now] = useState<number | null>(() => (typeof window === "undefined" ? null : Date.now()));
  return <span suppressHydrationWarning>{now ? fmtAgo(iso, now) : fmtDate(iso)}</span>;
}

type GridSort = "name" | "up" | "down" | "momentum";

function ChemicalGrid({ rows, period }: { rows: Row[]; period: PeriodKey }) {
  const wl = useWatchlist();
  const [cat, setCat] = useState<string>("all");
  const [freq, setFreq] = useState<"all" | "daily" | "monthly">("all");
  const [sort, setSort] = useState<GridSort>("name");
  const watchOnly = cat === "watch";
  let list = rows.filter((r) => (cat === "all" || watchOnly ? true : r.category === cat) && (freq === "all" || r.frequency === freq) && (!watchOnly || wl.has("chem", r.id)));
  list = [...list].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "momentum") return (b.momentum ?? -99) - (a.momentum ?? -99);
    const av = changeFor(a, period) ?? (sort === "up" ? -1e9 : 1e9);
    const bv = changeFor(b, period) ?? (sort === "up" ? -1e9 : 1e9);
    return sort === "up" ? bv - av : av - bv;
  });

  return (
    <section data-reveal data-tour="grid" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 flex items-center gap-1.5 text-lg font-semibold tracking-tight text-ink">
          All chemicals
          <InfoTip title="Chemical cards">
            <p><b>Daily</b> chemicals have a China futures price that updates every trading day. <b>Monthly</b> chemicals use India&apos;s average import price, published once a month.</p>
            <p>Star a card to add it to your watchlist. The bar under each card shows where today&apos;s price sits between its 52-week low and high.</p>
          </InfoTip>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5" data-noexport="true">
          <button type="button" className="chip" data-on={cat === "all"} onClick={() => setCat("all")}>
            All
          </button>
          <button type="button" className="chip" data-on={watchOnly} onClick={() => setCat("watch")}>
            ★ Watchlist ({wl.count("chem")})
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip" data-on={cat === c.id} onClick={() => setCat(c.id)}>
              <CategoryDot slot={c.slot} /> {c.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2" data-noexport="true">
          <Segmented
            size="sm"
            ariaLabel="Data frequency"
            value={freq}
            onChange={setFreq}
            options={[
              { value: "all", label: "All" },
              { value: "daily", label: "Daily" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as GridSort)} className="input h-8 w-auto text-[13px]" aria-label="Sort cards">
            <option value="name">A → Z</option>
            <option value="up">Biggest rise</option>
            <option value="down">Biggest fall</option>
            <option value="momentum">Strongest trend</option>
          </select>
        </div>
      </div>
      {list.length === 0 && (
        <div className="card p-10 text-center text-sm text-ink-2">{watchOnly ? "Your watchlist is empty. Tap the ☆ on any chemical to add it." : "Nothing matches these filters."}</div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((r) => (
          <Link key={r.id} href={hrefFor(r.id)} className="card card-hover group block p-4">
            <div className="flex items-start gap-2">
              <CategoryDot slot={categoryById[r.category!].slot} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink group-hover:text-accent-ink">{r.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {r.short} <FreqBadge frequency={r.frequency} />
                  {r.noisy && !r.isGroupData && (
                    <span className="rounded bg-surface-3 px-1 text-[10px] font-semibold text-ink-2" title="India imports only small or irregular amounts, so the monthly import price jumps around. Read it with care.">
                      NOISY
                    </span>
                  )}
                  {r.isGroupData && (
                    <span className="rounded bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] px-1 text-[10px] font-semibold text-ink-2" title="Customs data covers a broad product group">
                      GROUP
                    </span>
                  )}
                </div>
              </div>
              <StarButton id={r.id} name={r.name} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <PriceText row={r} className="block text-lg font-semibold text-ink" />
                <div className="mt-0.5 flex items-center gap-2">
                  <Change value={changeFor(r, period)} size="xs" />
                  <span className="text-[11px] text-muted">{PERIOD_LABEL[period].toLowerCase()}</span>
                </div>
              </div>
              <Sparkline values={r.spark} width={110} height={40} animate={false} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <TrendBadge dir={r.trend.dir} />
              <div className="flex-1">
                <RangeBar pos={r.rangePos} lo={r.lo52} hi={r.hi52} unit={r.unit} compact />
              </div>
              <span className="text-[11px] text-muted">{r.frequency === "monthly" ? fmtDate(r.lastDate, "month") : fmtDate(r.lastDate)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
