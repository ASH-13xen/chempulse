"use client";

import { ArrowDown, ArrowUp, Columns3, Download, RotateCcw, Search } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { categories, categoryById, hrefFor } from "@/lib/catalog";
import { downloadCsv } from "@/lib/download";
import { fmtDate, fmtPct, fmtTonnes } from "@/lib/format";
import type { Board, Row } from "@/lib/types";
import { useMoney } from "../providers/money";
import { useSettings } from "../providers/settings";
import { useWatchlist } from "../providers/watchlist";
import { CategoryDot, Change, FreqBadge, TrendBadge } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";
import { PriceText, RangeBar, StarButton } from "../ui/row-bits";
import { Segmented } from "../ui/segmented";
import { Sparkline } from "../ui/sparkline";

type ColKey = "price" | "d1" | "w1" | "m1" | "m3" | "y1" | "ytd" | "trend" | "strength" | "typical" | "range" | "spark" | "impPrice" | "impYoY" | "asOf";

const COLS: { key: ColKey; label: string; info?: string; num?: boolean; defaultOn: boolean }[] = [
  { key: "price", label: "Price", defaultOn: true },
  { key: "d1", label: "1D", num: true, defaultOn: true },
  { key: "w1", label: "1W", num: true, defaultOn: true },
  { key: "m1", label: "1M", num: true, defaultOn: true },
  { key: "m3", label: "3M", num: true, defaultOn: true },
  { key: "y1", label: "1Y", num: true, defaultOn: true },
  { key: "ytd", label: "YTD", num: true, defaultOn: false },
  { key: "trend", label: "Trend", defaultOn: true, info: "Up when the short-term average is above the long-term average (20 vs 50 days; 3 vs 12 months for monthly data)." },
  { key: "strength", label: "Strength", num: true, defaultOn: true, info: "1-month change (3-month for monthly data) divided by the typical move. Above +1 is a strong rise for that chemical, below −1 a strong fall." },
  { key: "typical", label: "Typical move", num: true, defaultOn: false, info: "Usual size of one day's (or month's) move. Higher = more volatile." },
  { key: "range", label: "52-week range", defaultOn: true, info: "Where the latest price sits between the 52-week low and high (12 months for monthly data)." },
  { key: "spark", label: "Recent path", defaultOn: true },
  { key: "impPrice", label: "Import price /kg", num: true, defaultOn: true, info: "Latest monthly average India import price (customs value ÷ quantity)." },
  { key: "impYoY", label: "Import vol vs LY", num: true, defaultOn: true, info: "India's import volume in the latest month vs the same month last year." },
  { key: "asOf", label: "As of", defaultOn: false },
];

function sortValue(r: Row, key: ColKey | "name"): number | string | null {
  switch (key) {
    case "name":
      return r.name;
    case "price":
      return r.inrPerKg ?? r.last;
    case "d1":
    case "w1":
    case "m1":
    case "m3":
    case "y1":
    case "ytd":
      return r.changes[key];
    case "trend":
      return r.trend.dir === "up" ? 1 : r.trend.dir === "down" ? -1 : 0;
    case "strength":
      return r.momentum;
    case "typical":
      return r.typicalMove;
    case "range":
      return r.rangePos;
    case "impPrice":
      return r.imports?.price ?? null;
    case "impYoY":
      return r.imports?.qtyYoY ?? null;
    case "asOf":
      return r.lastDate;
    default:
      return null;
  }
}

export function Screener({ board }: { board: Board }) {
  const router = useRouter();
  const settings = useSettings();
  const wl = useWatchlist();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [scope, setScope] = useState<"chemical" | "market" | "all">("chemical");
  const [freq, setFreq] = useState<"all" | "daily" | "monthly">("all");
  const [trend, setTrend] = useState<"all" | "up" | "down" | "flat">("all");
  const [unusual, setUnusual] = useState(false);
  const [watch, setWatch] = useState(false);
  const [hideNoisy, setHideNoisy] = useState(false);
  const [sort, setSort] = useState<{ key: ColKey | "name"; dir: 1 | -1 }>({ key: "m1", dir: -1 });
  const [cols, setCols] = useState<Set<ColKey>>(() => new Set(COLS.filter((c) => c.defaultOn).map((c) => c.key)));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = board.rows.filter((r) => {
      if (scope !== "all" && r.type !== scope) return false;
      if (cats.length && (!r.category || !cats.includes(r.category))) return false;
      if (freq !== "all" && r.frequency !== freq) return false;
      if (trend !== "all" && r.trend.dir !== trend) return false;
      if (unusual && !r.unusual) return false;
      if (watch && !wl.has(r.type === "market" ? "market" : "chem", r.id)) return false;
      if (hideNoisy && !r.rankable) return false;
      if (s && !`${r.name} ${r.short} ${r.group ?? ""} ${r.category ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
    const changeSort = ["d1", "w1", "m1", "m3", "y1", "ytd", "strength"].includes(sort.key);
    list = [...list].sort((a, b) => {
      // noisy/group import prices go last when ranking by change, so they don't crowd the top
      if (changeSort && a.rankable !== b.rankable) return a.rankable ? -1 : 1;
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return list;
  }, [board.rows, q, cats, scope, freq, trend, unusual, watch, hideNoisy, sort, wl]);

  const total = board.rows.filter((r) => scope === "all" || r.type === scope).length;
  const reset = () => {
    setQ("");
    setCats([]);
    setFreq("all");
    setTrend("all");
    setUnusual(false);
    setWatch(false);
    setHideNoisy(false);
  };

  const exportCsv = () =>
    downloadCsv(`chempulse-screener-${new Date().toISOString().slice(0, 10)}.csv`, ["Name", "Type", "Category/Group", "Frequency", "Price", "Unit", "Approx Rs/kg", "1D %", "1W %", "1M %", "3M %", "1Y %", "YTD %", "Trend", "Strength", "Typical move %", "52w low", "52w high", "Import Rs/kg", "Import month", "Import qty t", "Import vol YoY %", "As of"], rows.map((r) => [
      r.name,
      r.type,
      r.category ? categoryById[r.category].name : r.group,
      r.frequency,
      r.last?.toFixed(4),
      r.unit,
      r.inrPerKg?.toFixed(2),
      ...(["d1", "w1", "m1", "m3", "y1", "ytd"] as const).map((k) => r.changes[k]?.toFixed(2)),
      r.trend.dir,
      r.momentum?.toFixed(2),
      r.typicalMove?.toFixed(2),
      r.lo52,
      r.hi52,
      r.imports?.price?.toFixed(2),
      r.imports?.month?.slice(0, 7),
      r.imports?.qtyT?.toFixed(1),
      r.imports?.qtyYoY?.toFixed(1),
      r.lastDate,
    ]));

  const th = (key: ColKey | "name", label: string, info?: string, num?: boolean) => (
    <th key={key} scope="col" className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-xs font-medium whitespace-nowrap text-muted ${num ? "text-right" : "text-left"} ${key === "name" ? "left-10 z-20" : ""}`}>
      <span className={`inline-flex items-center gap-1 ${num ? "flex-row-reverse" : ""}`}>
        <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : key === "name" ? 1 : -1 }))} className="inline-flex items-center gap-1 hover:text-ink">
          {label}
          {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
        {info && <InfoTip title={label}>{<p>{info}</p>}</InfoTip>}
      </span>
    </th>
  );

  return (
    <Reveal className="space-y-5">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Screener</h1>
          <p className="mt-1 text-sm text-ink-2">Filter, sort and export every chemical and market. Click a column to sort, a row to open it.</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="btn">
                <Columns3 className="size-4" /> Columns
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="pop max-h-[60vh] w-56 overflow-y-auto p-1.5">
                {COLS.map((c) => (
                  <DropdownMenu.CheckboxItem
                    key={c.key}
                    checked={cols.has(c.key)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) =>
                      setCols((prev) => {
                        const n = new Set(prev);
                        if (v) n.add(c.key);
                        else n.delete(c.key);
                        return n;
                      })
                    }
                    className="menu-item"
                  >
                    <span className={`inline-flex size-4 items-center justify-center rounded border ${cols.has(c.key) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-line-strong"}`}>{cols.has(c.key) && "✓"}</span>
                    {c.label}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" className="btn btn-primary" onClick={exportCsv}>
            <Download className="size-4" /> Export ({rows.length})
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div data-reveal className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" className="input pl-9" aria-label="Filter by name" />
          </div>
          <Segmented
            ariaLabel="Show"
            value={scope}
            onChange={setScope}
            options={[
              { value: "chemical", label: "Chemicals" },
              { value: "market", label: "Markets" },
              { value: "all", label: "Both" },
            ]}
          />
          <Segmented
            ariaLabel="Data frequency"
            value={freq}
            onChange={setFreq}
            options={[
              { value: "all", label: "Any data" },
              { value: "daily", label: "Daily" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <Segmented
            ariaLabel="Trend"
            value={trend}
            onChange={setTrend}
            options={[
              { value: "all", label: "Any trend" },
              { value: "up", label: "↗ Up" },
              { value: "down", label: "↘ Down" },
              { value: "flat", label: "→ Sideways" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip" data-on={cats.includes(c.id)} onClick={() => setCats((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
              <CategoryDot slot={c.slot} /> {c.name}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--line-strong)]" />
          <button type="button" className="chip" data-on={watch} onClick={() => setWatch(!watch)}>
            ★ Watchlist
          </button>
          <button type="button" className="chip" data-on={unusual} onClick={() => setUnusual(!unusual)} title="Latest move was much bigger than usual">
            ⚡ Unusual move
          </button>
          <button type="button" className="chip" data-on={hideNoisy} onClick={() => setHideNoisy(!hideNoisy)} title="Hide broad customs groups and noisy import prices">
            Hide noisy data
          </button>
          <button type="button" onClick={reset} className="ml-auto inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </div>

      <div data-reveal className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-ink-2">
          <span>
            Showing <b className="text-ink">{rows.length}</b> of {total}
          </span>
          <span className="text-xs text-muted">Prices: {settings.prices === "inr" ? "in ₹ (China futures ≈ ₹/kg)" : settings.prices === "usd" ? "in US$ (China futures ≈ $/kg)" : "original exchange units"} (change in settings)</span>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="tnum w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 w-10 border-b border-line bg-surface" />
                {th("name", "Name")}
                {COLS.filter((c) => cols.has(c.key)).map((c) => th(c.key, c.label, c.info, c.num))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => router.push(hrefFor(r.id))} className="group cursor-pointer">
                  <td className="sticky left-0 z-10 border-b border-line/70 bg-surface px-1 group-hover:bg-surface-2">
                    <StarButton id={r.id} name={r.name} kind={r.type === "market" ? "market" : "chem"} />
                  </td>
                  <td className="sticky left-10 z-10 border-b border-line/70 bg-surface px-3 py-2.5 group-hover:bg-surface-2">
                    <div className="flex min-w-[220px] items-center gap-2">
                      {r.category ? <CategoryDot slot={categoryById[r.category].slot} /> : <span className="size-2.5 rounded-sm bg-[var(--muted)]" />}
                      <span className="font-medium whitespace-nowrap text-ink group-hover:text-accent-ink">{r.name}</span>
                      <FreqBadge frequency={r.frequency} />
                      {r.isGroupData && <span className="text-[10px] font-semibold text-muted">GROUP</span>}
                      {r.noisy && !r.isGroupData && <span className="text-[10px] font-semibold text-muted">NOISY</span>}
                      {r.unusual && <span title="Unusual latest move">⚡</span>}
                    </div>
                  </td>
                  {COLS.filter((c) => cols.has(c.key)).map((c) => (
                    <td key={c.key} className={`border-b border-line/70 px-3 py-2.5 whitespace-nowrap group-hover:bg-surface-2 ${c.num ? "text-right" : ""}`}>
                      <Cell row={r} col={c.key} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-12 text-center text-sm text-ink-2">Nothing matches these filters.</div>}
        </div>
      </div>
    </Reveal>
  );
}

function Cell({ row: r, col }: { row: Row; col: ColKey }) {
  const money = useMoney();
  switch (col) {
    case "price":
      return <PriceText row={r} className="font-medium text-ink" />;
    case "d1":
    case "w1":
    case "m1":
    case "m3":
    case "y1":
    case "ytd":
      return <Change value={r.changes[col]} size="sm" />;
    case "trend":
      return <TrendBadge dir={r.trend.dir} />;
    case "strength":
      return r.momentum == null ? <span className="text-muted">–</span> : <span className={`font-medium ${r.momentum > 1 ? "text-up-ink" : r.momentum < -1 ? "text-down-ink" : "text-ink-2"}`}>{`${r.momentum > 0 ? "+" : ""}${r.momentum.toFixed(2)}`}</span>;
    case "typical":
      return <span className="text-ink-2">{r.typicalMove == null ? "–" : `±${r.typicalMove.toFixed(1)}%`}</span>;
    case "range":
      return <RangeBar pos={r.rangePos} lo={r.lo52} hi={r.hi52} unit={r.unit} compact />;
    case "spark":
      return <Sparkline values={r.spark} width={96} height={28} animate={false} />;
    case "impPrice":
      return r.imports?.price != null ? <span title={fmtDate(r.imports.month, "month")}>{money.kg(r.imports.price)}/kg</span> : <span className="text-muted">–</span>;
    case "impYoY":
      return r.imports?.qtyYoY != null ? (
        <span title={`${fmtTonnes(r.imports.qtyT)} in ${fmtDate(r.imports.month, "month")}`}>
          <Change value={r.imports.qtyYoY} digits={0} size="sm" />
        </span>
      ) : (
        <span className="text-muted">–</span>
      );
    case "asOf":
      return <span className="text-ink-2">{r.frequency === "monthly" ? fmtDate(r.lastDate, "month") : fmtDate(r.lastDate)}</span>;
  }
  return null;
}

export { fmtPct };
