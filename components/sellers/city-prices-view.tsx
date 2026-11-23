"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { categories, categoryById } from "@/lib/catalog";
import { fmtDate, fmtPct } from "@/lib/format";
import { FOCUS_REGIONS } from "@/lib/regions";
import type { SellerBoard } from "@/lib/seller-stats";
import { divergingFill } from "../charts/heat";
import { useMoney } from "../providers/money";
import { Card, StatTile } from "../ui/card";
import { CategoryDot } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";

export function CityPricesView({ board }: { board: SellerBoard }) {
  const money = useMoney();
  const otherRegions = board.regions.map((r) => r.region).filter((r) => !FOCUS_REGIONS.includes(r) && r !== "Unknown");
  const [extra, setExtra] = useState<string[]>(otherRegions.slice(0, 5));
  const [minSellers, setMinSellers] = useState(2);
  const cols = useMemo(() => [...FOCUS_REGIONS, ...extra], [extra]);

  const rows = useMemo(
    () =>
      board.products
        .filter((p) => p.stats.credible > 0)
        .map((p) => {
          const cells = cols.map((r) => {
            const s = p.regions.find((x) => x.region === r)?.stats;
            return s && s.credible >= minSellers ? { median: s.median, n: s.credible, lo: s.min, hi: s.max } : s ? { median: null, n: s.credible, lo: null, hi: null } : null;
          });
          return { p, cells };
        })
        .sort((a, b) => categoryById[a.p.category].slot - categoryById[b.p.category].slot || a.p.name.localeCompare(b.p.name)),
    [board.products, cols, minSellers],
  );

  const both = rows.filter((r) => r.cells[0]?.median != null && r.cells[1]?.median != null);
  const chennaiCheaper = both.filter((r) => r.cells[0]!.median! < r.cells[1]!.median!).length;

  return (
    <Reveal className="space-y-6">
      <div data-reveal>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">City prices</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Median asking price per kg (switch ₹ / $ in settings) per product and trading region, from every seller listing collected. Colour compares each city with the all-India median: blue = cheaper, orange = dearer. Lab packs, small packs and extreme prices are left out.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Products compared" value={rows.length} sub={`${both.length} have both Chennai and Mumbai prices`} />
        <StatTile label="Chennai cheaper" value={chennaiCheaper} sub={`of ${both.length} products`} />
        <StatTile label="Mumbai cheaper" value={both.length - chennaiCheaper} sub={`of ${both.length} products`} />
        <StatTile label="Data as of" value={board.lastSeen ? fmtDate(board.lastSeen.slice(0, 10)) : "–"} sub="latest seller listing read" />
      </div>

      <div data-reveal className="card flex flex-wrap items-center gap-2 p-4">
        <span className="text-xs text-ink-2">Also show</span>
        {otherRegions.slice(0, 16).map((r) => (
          <button key={r} type="button" className="chip h-7! text-xs!" data-on={extra.includes(r)} onClick={() => setExtra((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}>
            {r}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-2">
          Min. sellers per city
          <select value={minSellers} onChange={(e) => setMinSellers(Number(e.target.value))} className="input h-8 w-auto text-[0.8125rem]" aria-label="Minimum sellers">
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <InfoTip title="Minimum sellers">
            <p>A city&apos;s median is shown only when at least this many sellers there have a usable ₹/kg price. One or two sellers can be misleading.</p>
          </InfoTip>
        </span>
      </div>

      <Card
        title={`Median asking price by city (${money.kgUnit})`}
        subtitle="Number of priced sellers in brackets"
        exportName="city-prices"
        csv={() => ({
          header: ["Product", "Category", "All India median", ...cols.flatMap((c) => [`${c} median`, `${c} sellers`]), "Chennai vs Mumbai %", "India import Rs/kg", "Ask vs import %"],
          rows: rows.map(({ p, cells }) => [p.name, categoryById[p.category].name, p.stats.median?.toFixed(2), ...cells.flatMap((c) => [c?.median?.toFixed(2) ?? "", c?.n ?? 0]), p.chennaiVsMumbai?.toFixed(1), p.importPrice?.toFixed(2), p.markup?.toFixed(1)]),
        })}
      >
        <div className="overflow-x-auto">
          <table className="tnum w-full border-separate border-spacing-[3px] text-xs">
            <thead>
              <tr className="text-muted">
                <th className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium">Product</th>
                <th className="px-1 text-right font-medium">All India</th>
                {cols.map((c) => (
                  <th key={c} className={`min-w-[84px] px-1 text-center font-medium ${FOCUS_REGIONS.includes(c) ? "text-ink" : ""}`}>
                    {c}
                  </th>
                ))}
                <th className="px-1 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Chennai vs Mumbai
                    <InfoTip title="Chennai vs Mumbai">
                      <p>How much higher (+) or lower (−) the Chennai median is than the Mumbai median.</p>
                    </InfoTip>
                  </span>
                </th>
                <th className="px-1 text-right font-medium">Import {money.kgUnit}</th>
                <th className="px-1 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Ask vs import
                    <InfoTip title="Ask vs import">
                      <p>Typical asking price compared with what India paid for imports (customs value, before duty, freight and margin).</p>
                    </InfoTip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, cells }) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium whitespace-nowrap">
                    <Link href={`/products/${p.id}`} className="inline-flex items-center gap-2 text-ink hover:text-accent-ink hover:underline">
                      <CategoryDot slot={categoryById[p.category].slot} />
                      {p.name}
                    </Link>
                  </th>
                  <td className="px-2 text-right font-semibold text-ink">{p.stats.median != null ? money.kg(p.stats.median, 0) : "–"}</td>
                  {cells.map((c, i) => {
                    const diff = c?.median != null && p.stats.median ? (c.median / p.stats.median - 1) * 100 : null;
                    const f = divergingFill(diff, 40, "var(--s2)", "var(--s1)");
                    return (
                      <td
                        key={cols[i]}
                        className="h-10 rounded-[6px] px-1 text-center"
                        style={{ background: c?.median != null ? f.background : "var(--surface-2)", color: c?.median != null ? f.color : "var(--muted)" }}
                        title={c ? `${cols[i]}: ${c.median != null ? `${money.kg(c.median)}/kg, ${fmtPct(diff)} vs all-India, range ${money.kg(c.lo ?? 0, 0)}–${money.kg(c.hi ?? 0, 0)}` : "too few sellers"} (${c.n} priced)` : `${cols[i]}: no sellers`}
                      >
                        {c?.median != null ? (
                          <span className="font-semibold">
                            {money.kg(c.median, 0)} <span className="font-normal opacity-75">({c.n})</span>
                          </span>
                        ) : c ? (
                          <span>({c.n})</span>
                        ) : (
                          "·"
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-2 text-right font-medium whitespace-nowrap ${p.chennaiVsMumbai == null ? "text-muted" : "text-ink"}`}>{p.chennaiVsMumbai == null ? "–" : fmtPct(p.chennaiVsMumbai, 0)}</td>
                  <td className="px-2 text-right whitespace-nowrap text-ink-2">{p.importPrice ? money.kg(p.importPrice, 0) : "–"}</td>
                  <td className="px-2 text-right whitespace-nowrap text-ink-2">{p.markup == null ? "–" : fmtPct(p.markup, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-2">
          <span>vs all-India median:</span>
          {[-40, -20, 0, 20, 40].map((v) => {
            const f = divergingFill(v, 40, "var(--s2)", "var(--s1)");
            return (
              <span key={v} className="inline-flex h-6 w-14 items-center justify-center rounded-md text-[0.625rem] font-medium" style={{ background: f.background, color: f.color }}>
                {v > 0 ? "+" : v < 0 ? "−" : ""}
                {Math.abs(v)}%
              </span>
            );
          })}
          <span className="ml-2">
            {categories.length} categories · {rows.length} products
          </span>
        </div>
      </Card>
    </Reveal>
  );
}
