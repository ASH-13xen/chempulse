"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addMonths, monthKey, pct } from "@/lib/analytics";
import { categories, categoryById, chemicalById, hrefFor } from "@/lib/catalog";
import { fmtDate, fmtNum, fmtPct, fmtTonnes } from "@/lib/format";
import type { ImportsData } from "@/lib/imports-data";
import { ColumnChart, RankedBars } from "../charts/bars";
import { useMoney } from "../providers/money";
import { Card, StatTile } from "../ui/card";
import { CategoryDot, Change } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { CountUp, Reveal } from "../ui/motion";

const PRETTY: Record<string, string> = { "China P Rp": "China", "Korea Rp": "South Korea", "U Arab Emts": "UAE", "U S A": "USA", "Saudi Arab": "Saudi Arabia", "U K": "UK", Netherland: "Netherlands" };

export function ImportsView({ data }: { data: ImportsData }) {
  const money = useMoney();
  const [month, setMonth] = useState(data.months.at(-1) ?? "");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"value" | "qty" | "yoy" | "price">("value");
  const [allYoy, setAllYoy] = useState(false);
  const [allChina, setAllChina] = useState(false);

  const rows = useMemo(() => {
    const prevM = addMonths(month, -1);
    const lyM = addMonths(month, -12);
    return data.chems
      .map((c) => {
        const by = new Map(c.points.map((p) => [p.d, p]));
        const cur = by.get(month);
        const prev = by.get(prevM);
        const ly = by.get(lyM);
        const chem = chemicalById[c.id];
        const enough = (x?: { q: number }) => (x?.q ?? 0) >= 100_000;
        return {
          id: c.id,
          name: chem.name,
          category: chem.category,
          group: Boolean(chem.group),
          qtyT: (cur?.q ?? 0) / 1000,
          valCr: cur?.val ?? 0,
          price: cur?.v ?? null,
          qtyYoY: enough(cur) && enough(ly) ? pct(cur!.q, ly!.q) : null,
          priceMoM: pct(cur?.v ?? null, prev?.v ?? null),
          priceYoY: pct(cur?.v ?? null, ly?.v ?? null),
        };
      })
      .filter((r) => cat === "all" || r.category === cat)
      .sort((a, b) => (sort === "value" ? b.valCr - a.valCr : sort === "qty" ? b.qtyT - a.qtyT : sort === "yoy" ? (b.qtyYoY ?? -1e9) - (a.qtyYoY ?? -1e9) : (b.priceYoY ?? -1e9) - (a.priceYoY ?? -1e9)));
  }, [data, month, cat, sort]);

  const totalVal = rows.reduce((a, r) => a + r.valCr, 0);
  const totals24 = useMemo(() => {
    const ms = data.months.slice(-24);
    return ms.map((m) => ({ label: `${fmtDate(m, "month").slice(0, 3)} ${m.slice(2, 4)}`, value: data.chems.filter((c) => cat === "all" || chemicalById[c.id].category === cat).reduce((a, c) => a + (c.points.find((p) => p.d === m)?.val ?? 0), 0), detail: fmtDate(m, "month") }));
  }, [data, cat]);
  const lyTotal = data.chems.filter((c) => cat === "all" || chemicalById[c.id].category === cat).reduce((a, c) => a + (c.points.find((p) => p.d === addMonths(month, -12))?.val ?? 0), 0);
  const yoyMovers = rows
    .filter((r) => r.qtyYoY != null && !r.group && r.qtyT >= 100)
    .sort((a, b) => b.qtyYoY! - a.qtyYoY!)
    .map((r) => ({ id: r.id, label: r.name, value: Math.max(-100, Math.min(300, r.qtyYoY!)), display: `${fmtPct(r.qtyYoY, 0)} · ${fmtTonnes(r.qtyT)}` }));
  const chinaRows = Object.entries(data.origins)
    .filter(([id, o]) => o.china != null && (cat === "all" || chemicalById[id].category === cat))
    .sort((a, b) => b[1].china! - a[1].china!)
    .map(([id, o]) => ({ id, label: chemicalById[id].name, value: o.china!, display: `${o.china!.toFixed(0)}%` }));
  const originsMonth = Object.values(data.origins)[0]?.month;
  // the two side-by-side lists show the same number of rows so the cards line up
  const yoyShown = allYoy || yoyMovers.length <= PEEK ? yoyMovers : [...yoyMovers.slice(0, PEEK / 2), ...yoyMovers.slice(-PEEK / 2)];
  const chinaShown = allChina ? chinaRows : chinaRows.slice(0, PEEK);

  return (
    <Reveal className="space-y-6">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">India imports</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">Official monthly import data (DGCI&S via Tradestat) for every chemical tracked: how much came in, what India paid per kg, and where it came from. Published about 6–8 weeks after month-end.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-ink-2" htmlFor="month">
            Month
          </label>
          <select id="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input h-9 w-auto">
            {[...data.months].reverse().map((m) => (
              <option key={m} value={m}>
                {fmtDate(m, "month")}
              </option>
            ))}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input h-9 w-auto" aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Import bill" value={<CountUp value={totalVal} format={(v) => money.crore(v)} />} sub={`${fmtDate(month, "month")}, ${rows.length} chemicals`} info={<p>Total customs value of the chemicals shown, in ₹ crore (1 crore = 10 million) or US$ million, depending on the currency setting.</p>} />
        <StatTile label="vs same month last year" value={<Change value={pct(totalVal, lyTotal)} size="lg" className="text-[28px]!" />} sub={`${money.crore(lyTotal)} in ${fmtDate(addMonths(month, -12), "month")}`} />
        <StatTile label="Rising imports" value={rows.filter((r) => (r.qtyYoY ?? 0) > 10).length} sub="volume up more than 10% vs last year" tone="up" />
        <StatTile label="Falling imports" value={rows.filter((r) => (r.qtyYoY ?? 0) < -10).length} sub="volume down more than 10% vs last year" tone="down" />
      </div>

      <Card title="Import bill by month" subtitle={`${money.mode === "usd" ? "US$ million" : "₹ crore"}, chemicals shown, last 24 months`} info={<p>The total value of imports of the chemicals tracked here. A rising bill can be higher prices, more volume, or a weaker rupee.</p>} exportName="import-bill" csv={() => ({ header: ["Month", "Rs crore"], rows: totals24.map((t) => [t.detail, t.value.toFixed(2)]) })}>
          <ColumnChart data={money.mode === "usd" && money.fx.usdinr ? totals24.map((t) => ({ ...t, value: (t.value * 1e7) / money.fx.usdinr! / 1e6 })) : totals24} format={(v) => (money.mode === "usd" ? `$${fmtNum(v, { digits: 0 })} m` : `₹${fmtNum(v, { digits: 0 })} cr`)} axisFormat={(v) => fmtNum(v, { digits: 0, compact: true })} height={230} capLabels={false} />
        </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`Volume change vs last year · ${fmtDate(month, "month")}`} subtitle={allYoy || yoyMovers.length <= PEEK ? "Excludes broad groups and months under 100 t" : `Biggest ${PEEK / 2} rises and ${PEEK / 2} falls · excludes broad groups and months under 100 t`} info={<p>Big rises often mean demand growth or a domestic plant outage; big falls can mean new local capacity, high stocks or weak demand. Values are capped at +300% for display.</p>} exportName="import-volume-yoy" csv={() => ({ header: ["Chemical", "Volume YoY %", "Tonnes"], rows: yoyMovers.map((r) => [r.label, r.value.toFixed(1), (rows.find((x) => x.id === r.id)?.qtyT ?? 0).toFixed(1)]) })}>
          {yoyMovers.length ? <RankedBars data={yoyShown} diverging labelWidth={180} /> : <p className="text-sm text-ink-2">No comparable months.</p>}
          <MoreToggle total={yoyMovers.length} open={allYoy} onToggle={() => setAllYoy(!allYoy)} />
        </Card>
        <Card
          title="Dependence on China"
          subtitle={originsMonth ? `Share of import volume, FY to ${fmtDate(originsMonth + "-01", "month")}` : "No origin data"}
          info={<p>How much of India&apos;s imports of each chemical came from China this financial year. High dependence means Chinese prices, holidays and export policies hit Indian prices fast.</p>}
          exportName="china-dependence"
          csv={() => ({ header: ["Chemical", "China share %", "Top origins"], rows: chinaRows.map((r) => [r.label, r.value.toFixed(1), data.origins[r.id].top.map((t) => `${PRETTY[t.country] ?? t.country} ${t.share.toFixed(0)}%`).join("; ")]) })}
        >
          <RankedBars data={chinaShown} labelWidth={170} slot={1} />
          <MoreToggle total={chinaRows.length} open={allChina} onToggle={() => setAllChina(!allChina)} />
        </Card>
      </div>

      <Card
          title="All chemicals"
          subtitle={`${fmtDate(month, "month")} · click a row for the full history`}
          exportName={`imports-${monthKey(month)}`}
          csv={() => ({ header: ["Chemical", "Tonnes", "Rs crore", "Rs/kg", "Volume YoY %", "Price MoM %", "Price YoY %"], rows: rows.map((r) => [r.name, r.qtyT.toFixed(1), r.valCr.toFixed(2), r.price?.toFixed(2), r.qtyYoY?.toFixed(1), r.priceMoM?.toFixed(1), r.priceYoY?.toFixed(1)]) })}
          actions={
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input h-8 w-auto text-[13px]" aria-label="Sort">
              <option value="value">Sort: value</option>
              <option value="qty">Sort: volume</option>
              <option value="yoy">Sort: volume vs LY</option>
              <option value="price">Sort: price vs LY</option>
            </select>
          }
        >
          <div className="max-h-[640px] overflow-auto">
            <table className="tnum w-full text-sm">
              <thead className="sticky top-0 bg-surface text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 text-left font-medium">Chemical</th>
                  <th className="py-2 pr-3 text-right font-medium">Volume</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      vs LY
                      <InfoTip title="vs LY">
                        <p>Volume compared with the same month last year. Blank when either month is under 100 t.</p>
                      </InfoTip>
                    </span>
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">{money.kgUnit}</th>
                  <th className="py-2 pr-3 text-right font-medium">vs prev month</th>
                  <th className="py-2 text-right font-medium">vs LY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-surface-2">
                    <td className="py-2 pr-3">
                      <Link href={hrefFor(r.id)} className="inline-flex items-center gap-2 font-medium text-ink hover:text-accent-ink">
                        <CategoryDot slot={categoryById[r.category].slot} />
                        {r.name}
                        {r.group && <span className="text-[10px] font-semibold text-muted">GROUP</span>}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap text-ink-2">{fmtTonnes(r.qtyT)}</td>
                    <td className="py-2 pr-3 text-right">
                      <Change value={r.qtyYoY} digits={0} size="sm" />
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-ink">{r.price == null ? "–" : money.kg(r.price)}</td>
                    <td className="py-2 pr-3 text-right">
                      <Change value={r.priceMoM} size="sm" />
                    </td>
                    <td className="py-2 text-right">
                      <Change value={r.priceYoY} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
    </Reveal>
  );
}

const PEEK = 12;

function MoreToggle({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= PEEK) return null;
  return (
    <button type="button" onClick={onToggle} className="mt-3 text-[13px] font-medium text-accent-ink hover:underline">
      {open ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}
