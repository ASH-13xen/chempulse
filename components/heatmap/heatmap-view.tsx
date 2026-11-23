"use client";

import { useMemo, useState } from "react";
import { categories, categoryById, hrefFor } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";
import type { HeatData } from "@/lib/heat";
import type { Board } from "@/lib/types";
import { Heatmap, HeatLegend } from "../charts/heat";
import { Card, DataTable } from "../ui/card";
import { CategoryDot } from "../ui/change";
import { Reveal } from "../ui/motion";
import { Segmented } from "../ui/segmented";

type Sort = "category" | "name" | "latest" | "total";

export function HeatmapView({ board, heat }: { board: Board; heat: HeatData }) {
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [scope, setScope] = useState<"chemical" | "market" | "all">("chemical");
  const [sort, setSort] = useState<Sort>("category");
  const [cats, setCats] = useState<string[]>([]);
  const rowsById = useMemo(() => Object.fromEntries(board.rows.map((r) => [r.id, r])), [board.rows]);
  const data = heat[mode];
  const cap = mode === "weekly" ? 6 : 15;

  const columns = data.columns.map((k) => (mode === "weekly" ? { key: k, label: fmtDate(k), title: `Week of ${fmtDate(k, "long")}` } : { key: k, label: fmtDate(k + "-01", "month").replace(" 20", " ’"), title: fmtDate(k + "-01", "month") }));

  const rows = useMemo(() => {
    const list = data.rows
      .map((hr) => ({ hr, r: rowsById[hr.id] }))
      .filter(({ r }) => r && (scope === "all" || r.type === scope) && (!cats.length || (r.category && cats.includes(r.category))))
      .map(({ hr, r }) => {
        const valid = hr.cells.filter((c): c is number => c != null);
        const latest = [...hr.cells].reverse().find((c) => c != null) ?? null;
        const total = valid.length ? (valid.reduce((acc, c) => acc * (1 + c / 100), 1) - 1) * 100 : null;
        return { r, cells: hr.cells, latest, total };
      });
    list.sort((a, b) => {
      if (sort === "name") return a.r.name.localeCompare(b.r.name);
      if (sort === "latest") return (b.latest ?? -999) - (a.latest ?? -999);
      if (sort === "total") return (b.total ?? -999) - (a.total ?? -999);
      const ca = a.r.category ? categoryById[a.r.category].slot : 99;
      const cb = b.r.category ? categoryById[b.r.category].slot : 99;
      return ca - cb || a.r.name.localeCompare(b.r.name);
    });
    return list;
  }, [data, rowsById, scope, cats, sort]);

  return (
    <Reveal className="space-y-5">
      <div data-reveal>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Heatmap</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Every cell is one {mode === "weekly" ? "week" : "month"}&apos;s % change. Read across a row to see a chemical&apos;s rhythm; read down a column to spot sector-wide moves (a whole column turning one colour usually means crude, the rupee or China moved).
        </p>
      </div>
      <div data-reveal className="card flex flex-wrap items-center gap-2 p-4">
        <Segmented
          ariaLabel="Period"
          value={mode}
          onChange={setMode}
          options={[
            { value: "weekly", label: "Weekly (12 weeks)" },
            { value: "monthly", label: "Monthly (13 months)" },
          ]}
        />
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
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input h-8 w-auto text-[13px]" aria-label="Sort rows">
          <option value="category">Sort: category</option>
          <option value="name">Sort: A → Z</option>
          <option value="latest">Sort: latest change</option>
          <option value="total">Sort: total change</option>
        </select>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip h-7! text-xs!" data-on={cats.includes(c.id)} onClick={() => setCats((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
              <CategoryDot slot={c.slot} /> {c.name}
            </button>
          ))}
        </div>
      </div>
      {mode === "weekly" && scope !== "market" && (
        <p data-reveal className="text-[13px] text-ink-2">
          Weekly view shows chemicals with daily prices. Switch to monthly to include chemicals that only have India import data.
        </p>
      )}
      <Card
        title={`${mode === "weekly" ? "Weekly" : "Monthly"} % change`}
        subtitle={`${rows.length} rows · darker = bigger move`}
        info={
          <>
            <p>Colour shows direction and size: the stronger the colour, the bigger the move. Grey is close to zero, and a dot means no data.</p>
            <p>For monthly-only chemicals, the change is in India&apos;s average import price. Months with tiny shipments are left blank.</p>
          </>
        }
        exportName={`heatmap-${mode}`}
        csv={() => ({ header: ["Name", ...columns.map((c) => c.title ?? c.label)], rows: rows.map((x) => [x.r.name, ...x.cells.map((c) => (c == null ? "" : c.toFixed(2)))]) })}
        table={() => <DataTable header={["Name", ...columns.map((c) => c.label)]} rows={rows.map((x) => [x.r.name, ...x.cells.map((c) => (c == null ? null : `${c.toFixed(1)}%`))])} />}
        actions={<HeatLegend cap={cap} label="Change" />}
      >
        <Heatmap
          key={`${mode}-${scope}-${sort}-${cats.join()}`}
          cap={cap}
          columns={columns}
          rows={rows.map((x) => ({
            id: x.r.id,
            name: x.r.name,
            href: hrefFor(x.r.id),
            slot: x.r.category ? categoryById[x.r.category].slot : undefined,
            tag: x.r.isGroupData || x.r.noisy ? <span className="text-[10px] font-semibold text-muted">{x.r.isGroupData ? "GROUP" : "NOISY"}</span> : undefined,
            cells: x.cells,
          }))}
          unitLabel={mode === "weekly" ? "week-on-week change" : "month-on-month change"}
        />
      </Card>
    </Reveal>
  );
}
