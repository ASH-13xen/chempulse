"use client";

import { BellPlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { METRIC_LABEL, ruleHit, ruleValue } from "@/lib/rules";
import type { Board, SignalEvent } from "@/lib/types";
import { SignalList } from "../dashboard/dashboard";
import { updateSettings, useSettings, type AlertRule } from "../providers/settings";
import { useWatchlist } from "../providers/watchlist";
import { Card, Empty } from "../ui/card";
import { Reveal } from "../ui/motion";

const TYPES: { id: string; label: string; match: SignalEvent["type"][] }[] = [
  { id: "all", label: "All", match: [] },
  { id: "trend", label: "Trend turns", match: ["cross-up", "cross-down"] },
  { id: "extremes", label: "Highs & lows", match: ["high", "low"] },
  { id: "moves", label: "Unusual moves", match: ["jump", "drop"] },
  { id: "imports", label: "Import swings", match: ["import-surge", "import-slump"] },
];

export function AlertsView({ board }: { board: Board }) {
  const settings = useSettings();
  const wl = useWatchlist();
  const [type, setType] = useState("all");
  const [scope, setScope] = useState<"all" | "chemical" | "market" | "watch">("all");
  const rowsById = useMemo(() => Object.fromEntries(board.rows.map((r) => [r.id, r])), [board.rows]);
  const events = board.events.filter((e) => {
    const t = TYPES.find((x) => x.id === type)!;
    if (t.match.length && !t.match.includes(e.type)) return false;
    const r = rowsById[e.rowId];
    if (scope === "watch") return wl.has(r?.type === "market" ? "market" : "chem", e.rowId);
    if (scope !== "all" && r?.type !== scope) return false;
    return true;
  });

  const [form, setForm] = useState<{ target: string; metric: AlertRule["metric"]; op: AlertRule["op"]; value: string }>({ target: "pp", metric: "w1", op: ">", value: "3" });
  const addRule = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(form.value);
    if (!Number.isFinite(value)) return;
    updateSettings((s) => ({ rules: [...s.rules, { id: `${Date.now()}`, target: form.target, metric: form.metric, op: form.op, value, createdAt: new Date().toISOString() }] }));
  };

  return (
    <Reveal className="space-y-6">
      <div data-reveal>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Signals & alerts</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Signals are spotted automatically in the last 30 days of prices (3 months for monthly data). Alert rules are your own thresholds; they are checked every time you open the site and show up on the bell.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title={`Detected signals (${events.length})`}
          info={
            <>
              <p><b>Trend turns</b>: short-term average crossed the long-term average.</p>
              <p><b>Highs & lows</b>: highest/lowest in 52 weeks (3 years for monthly data).</p>
              <p><b>Unusual moves</b>: one day&apos;s move at least 2.5× the typical daily move (2× for monthly).</p>
              <p><b>Import swings</b>: India&apos;s import volume up 50%+ or down 40%+ vs the same month last year.</p>
            </>
          }
          png={false}
          csv={() => ({ header: ["Date", "Name", "Type", "Signal"], rows: events.map((e) => [e.d, e.name, e.type, e.text]) })}
          exportName="signals"
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button key={t.id} type="button" className="chip" data-on={type === t.id} onClick={() => setType(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="mx-1 h-6 w-px self-center bg-[var(--line-strong)]" />
            {(
              [
                ["all", "Everything"],
                ["chemical", "Chemicals"],
                ["market", "Markets"],
                ["watch", "★ Watchlist"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className="chip" data-on={scope === v} onClick={() => setScope(v)}>
                {l}
              </button>
            ))}
          </div>
          <SignalList events={events.slice(0, 80)} />
        </Card>

        <Card
          className="xl:col-span-2"
          title="My alert rules"
          info={<p>Create a rule such as “PP 1-week change above +3%”. Rules are saved in this browser. When a rule is met, the bell in the top bar shows it.</p>}
          png={false}
        >
          <form onSubmit={addRule} className="grid grid-cols-2 gap-3" aria-label="New alert rule">
            <label className="col-span-2 text-xs text-ink-2">
              Chemical or market
              <select className="input mt-1" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                <optgroup label="Chemicals">
                  {board.rows
                    .filter((r) => r.type === "chemical")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Markets">
                  {board.rows
                    .filter((r) => r.type === "market")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            <label className="text-xs text-ink-2">
              When
              <select className="input mt-1" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as AlertRule["metric"] })}>
                {Object.entries(METRIC_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-2">
                is
                <select className="input mt-1" value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value as AlertRule["op"] })}>
                  <option value=">">above</option>
                  <option value="<">below</option>
                </select>
              </label>
              <label className="text-xs text-ink-2">
                {form.metric === "last" ? "Price" : "%"}
                <input className="input mt-1" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </label>
            </div>
            <p className="col-span-2 text-xs text-muted">
              Now: {(() => {
                const r = rowsById[form.target];
                const v = ruleValue({ ...form, value: 0, id: "", createdAt: "" }, r);
                return v == null ? "no data" : form.metric === "last" ? fmtPrice(v, r.unit) : fmtPct(v);
              })()}
            </p>
            <button type="submit" className="btn btn-primary col-span-2 justify-center">
              <BellPlus className="size-4" /> Add rule
            </button>
          </form>

          <div className="mt-5 space-y-2">
            {settings.rules.length === 0 && <Empty title="No rules yet">Rules help you catch the moves you care about, for example “Methanol 1-month change below −5%”.</Empty>}
            {settings.rules.map((rule) => {
              const r = rowsById[rule.target];
              const hit = ruleHit(rule, r);
              const v = ruleValue(rule, r);
              return (
                <div key={rule.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${hit ? "border-[color-mix(in_oklab,var(--accent)_50%,transparent)] bg-accent-wash" : "border-line"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      {r?.name ?? rule.target}: {METRIC_LABEL[rule.metric].toLowerCase()} {rule.op === ">" ? "above" : "below"} {rule.metric === "last" ? fmtPrice(rule.value, r?.unit ?? "") : `${rule.value}%`}
                    </div>
                    <div className="text-xs text-ink-2">
                      {hit ? "● Triggered" : "Waiting"} · now {v == null ? "–" : rule.metric === "last" ? fmtPrice(v, r!.unit) : fmtPct(v)} · since {fmtDate(rule.createdAt.slice(0, 10))}
                    </div>
                  </div>
                  <button type="button" aria-label="Delete rule" onClick={() => updateSettings((s) => ({ rules: s.rules.filter((x) => x.id !== rule.id) }))} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-down-ink">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Reveal>
  );
}
