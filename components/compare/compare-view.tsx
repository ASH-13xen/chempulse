"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, correlation, periodReturns, rebase, returns, stdev, type VP } from "@/lib/analytics";
import { categoryById, chemicalById } from "@/lib/catalog";
import { fmtDate, fmtPct } from "@/lib/format";
import { useMoney } from "../providers/money";
import type { Board } from "@/lib/types";
import { CorrMatrix } from "../charts/heat";
import { IndexedChart, type IndexedLine } from "../charts/indexed-chart";
import { Card, DataTable } from "../ui/card";
import { CategoryDot } from "../ui/change";
import { Reveal } from "../ui/motion";
import { Segmented } from "../ui/segmented";
import { SearchField } from "@/components/ui/search-field";

type Loaded = { name: string; unit: string; frequency: "daily" | "monthly"; points: VP[] };
type Win = "3M" | "6M" | "1Y" | "3Y" | "5Y";
const MONTHS: Record<Win, number> = { "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 };
const MAX = 6;

const PRESETS: { label: string; ids: string[] }[] = [
  { label: "PP vs its feedstocks", ids: ["pp", "propylene", "propane", "brent"] },
  { label: "Polymers", ids: ["pp", "pe", "pvc"] },
  { label: "Aromatics chain", ids: ["benzene", "styrene", "cn-px", "brent"] },
  { label: "Polyester chain", ids: ["pta", "meg", "cn-px"] },
  { label: "Crude, gas & rupee", ids: ["brent", "henryhub", "usdinr", "cnyinr"] },
  { label: "Solvents (imports)", ids: ["toluene", "acetone", "ipa"] },
];

async function fetchWithRetry(url: string, tries = 3): Promise<{ name: string; unit: string; frequency: "daily" | "monthly"; points: [string, number][] }> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error(`Could not load ${url.split("/").pop()}: ${String(last)}`);
}

export function CompareView({ board, initial }: { board: Board; initial: string[] }) {
  const money = useMoney();
  const valid = useMemo(() => new Set(board.rows.map((r) => r.id)), [board.rows]);
  const start = initial.filter((i) => valid.has(i)).slice(0, MAX);
  const [sel, setSel] = useState<string[]>(start.length ? start : PRESETS[0].ids);
  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries((start.length ? start : PRESETS[0].ids).map((id, i) => [id, i + 1])));
  const [data, setData] = useState<Record<string, Loaded>>({});
  const [win, setWin] = useState<Win>("1Y");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const missing = sel.filter((id) => !data[id]);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        fetchWithRetry(`/api/series/${id}`)
          .then((j) => [id, { name: j.name, unit: j.unit, frequency: j.frequency, points: (j.points as [string, number][]).map(([d, v]) => ({ d, v })) }] as const),
      ),
    )
      .then((entries) => !cancelled && setData((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
      .catch((e) => !cancelled && setErr(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [sel, data]);

  // Keep the URL shareable without a server round-trip.
  useEffect(() => {
    window.history.replaceState(null, "", `/compare?s=${sel.join(",")}`);
  }, [sel]);

  const add = (id: string) => {
    if (sel.includes(id) || sel.length >= MAX) return;
    const used = new Set(sel.map((s) => slots[s]));
    const slot = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !used.has(n)) ?? 1;
    setSlots((s) => ({ ...s, [id]: slot }));
    setSel((s) => [...s, id]);
  };
  const remove = (id: string) => setSel((s) => s.filter((x) => x !== id));
  const preset = (ids: string[]) => {
    setSlots(Object.fromEntries(ids.map((id, i) => [id, i + 1])));
    setSel(ids);
  };

  // Everything derived from the selection, computed once per change.
  const { ready, from, anyMonthly, lines, matrix, perf } = useMemo(() => {
    const ready = sel.filter((id) => data[id]);
    const latest = ready.map((id) => data[id].points.at(-1)?.d ?? "").sort().at(-1) ?? "";
    const from = latest ? addMonths(latest, -MONTHS[win]) : "";
    const anyMonthly = ready.some((id) => data[id].frequency === "monthly");
    const lines: IndexedLine[] = ready.map((id) => ({ id, name: data[id].name, slot: slots[id] ?? 1, points: rebase(data[id].points, from) })).filter((l) => l.points.length > 1);
    const period = anyMonthly ? "month" : "week";
    const rets = ready.map((id) => periodReturns(data[id].points.filter((p) => p.d >= from), period));
    const matrix = ready.map((_, i) => ready.map((_, j) => (i === j ? 1 : correlation(rets[i], rets[j], anyMonthly ? 6 : 8).r)));
    const perf = ready.map((id) => {
      const pts = data[id].points.filter((p) => p.d >= from);
      const first = pts[0];
      const last = pts.at(-1);
      const vals = pts.map((p) => p.v);
      const r = returns(pts).map((x) => x.r);
      return { id, name: data[id].name, unit: data[id].unit, freq: data[id].frequency, first, last, change: first && last ? (last.v / first.v - 1) * 100 : null, hi: vals.length ? Math.max(...vals) : null, lo: vals.length ? Math.min(...vals) : null, vol: r.length > 2 ? stdev(r) : null };
    });
    return { ready, from, anyMonthly, lines, matrix, perf };
  }, [sel, data, win, slots]);

  return (
    <Reveal className="space-y-5">
      <div data-reveal>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Compare</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Put up to {MAX} chemicals and markets on one chart. Every line starts at 100, so a move to 110 means +10% whatever the unit (¥/t, $/barrel, ₹/kg).</p>
      </div>

      <div data-reveal className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {sel.map((id) => (
            <span key={id} className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-2 pr-1 pl-3 text-[0.8125rem] font-medium text-ink">
              <i aria-hidden className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: `var(--s${slots[id]})` }} />
              {board.rows.find((r) => r.id === id)?.name ?? id}
              <button type="button" onClick={() => remove(id)} aria-label={`Remove ${id}`} className="rounded-full p-1 text-muted hover:bg-surface-3 hover:text-ink">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {sel.length < MAX && <Picker board={board} exclude={sel} onPick={add} />}
          <div className="ml-auto">
            <Segmented ariaLabel="Window" value={win} onChange={setWin} options={(Object.keys(MONTHS) as Win[]).map((w) => ({ value: w, label: w }))} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
          <span className="mr-1 text-xs text-muted">Quick sets:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip h-7! text-xs!" onClick={() => preset(p.ids)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-sm text-down-ink">{err}</p>}

      <Card
        title="Rebased performance"
        subtitle={from ? `100 = price on ${fmtDate(from, "long")}` : "Loading…"}
        info={
          <>
            <p>Each series is divided by its own value on the start date and multiplied by 100. Units disappear, so only the % moves are compared.</p>
            <p>Monthly import prices appear as steps; daily prices as continuous lines.</p>
          </>
        }
        exportName="compare-rebased"
        csv={() => {
          const dates = [...new Set(lines.flatMap((l) => l.points.map((p) => p.d)))].sort();
          const maps = lines.map((l) => new Map(l.points.map((p) => [p.d, p.v])));
          return { header: ["Date", ...lines.map((l) => l.name)], rows: dates.map((d) => [d, ...maps.map((m) => m.get(d)?.toFixed(2) ?? "")]) };
        }}
      >
        {lines.length ? <IndexedChart lines={lines} height={420} monthly={anyMonthly && lines.length === 1} /> : <div className="shimmer h-[420px] rounded-xl" />}
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-2"
          title="How closely they move"
          subtitle={`Correlation of ${anyMonthly ? "monthly" : "weekly"} changes in the window`}
          info={
            <>
              <p>1.00 = always move the same way, 0 = unrelated, −1.00 = opposite. Blue cells move together; orange cells move against each other.</p>
              <p>A strong link with a feedstock (crude, propylene, benzene) means that feedstock is a good early signal.</p>
            </>
          }
          exportName="compare-correlation"
          csv={() => ({ header: ["", ...ready.map((id) => data[id].name)], rows: ready.map((id, i) => [data[id].name, ...matrix[i].map((r) => (r == null ? "" : r.toFixed(3)))]) })}
        >
          {ready.length > 1 ? <CorrMatrix names={ready.map((id) => board.rows.find((r) => r.id === id)?.short ?? id)} matrix={matrix} /> : <p className="text-sm text-ink-2">Add at least two series.</p>}
        </Card>
        <Card
          className="xl:col-span-3"
          title="Scorecard"
          subtitle="Over the selected window"
          exportName="compare-scorecard"
          csv={() => ({ header: ["Name", "Unit", "Start", "Latest", "Change %", "High", "Low", "Typical move %"], rows: perf.map((p) => [p.name, p.unit, p.first?.v, p.last?.v, p.change?.toFixed(2), p.hi, p.lo, p.vol?.toFixed(2)]) })}
          png
        >
          <DataTable
            header={["Name", "Start", "Latest", "Change", "High", "Low", "Typical move"]}
            rows={perf.map((p) => [p.name, money.fmt(p.first?.v, p.unit), money.fmt(p.last?.v, p.unit), fmtPct(p.change), money.fmt(p.hi, p.unit), money.fmt(p.lo, p.unit), p.vol == null ? "–" : `±${p.vol.toFixed(1)}% / ${p.freq === "daily" ? "day" : "month"}`])}
          />
        </Card>
      </div>
    </Reveal>
  );
}

function Picker({ board, exclude, onPick }: { board: Board; exclude: string[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const options = board.rows.filter((r) => !exclude.includes(r.id) && `${r.name} ${r.short} ${r.group ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setQ("");
    setOpen(false);
  };
  return (
    <div ref={box} className="relative">
      {!open ? (
        <button type="button" className="chip" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add series
        </button>
      ) : (
        <div className="relative">
          <SearchField
            size="sm"
            wrapperClassName="w-64"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="compare-options"
            aria-label="Add a series"
            value={q}
            onValueChange={(v) => {
              setQ(v);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter" && options[active]) pick(options[active].id);
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Type a chemical or market…"
          />
          <ul id="compare-options" role="listbox" className="pop absolute top-10 left-0 z-30 max-h-80 w-80 overflow-y-auto p-1.5">
            {options.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(r.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}>
                  {chemicalById[r.id] ? <CategoryDot slot={categoryById[chemicalById[r.id].category].slot} /> : <span className="size-2.5 rounded-sm bg-[var(--muted)]" />}
                  <span className="flex-1 truncate text-ink">{r.name}</span>
                  <span className="text-xs text-muted">{r.frequency === "daily" ? "Daily" : "Monthly"}</span>
                </button>
              </li>
            ))}
            {!options.length && <li className="px-3 py-4 text-center text-sm text-ink-2">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
