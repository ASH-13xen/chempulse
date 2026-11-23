"use client";

import { ArrowLeft, Search, Store } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryById, chemicalById } from "@/lib/catalog";
import { fmtDate, fmtPct } from "@/lib/format";
import type { Product } from "@/lib/products";
import { FOCUS_REGIONS } from "@/lib/regions";
import { statsOf, type Listing, type ProductSummary } from "@/lib/seller-stats";
import { RankedBars } from "../charts/bars";
import { LinesChart } from "../charts/lines-chart";
import { StripPlot } from "../charts/strip-plot";
import { Card, StatTile } from "../ui/card";
import { CategoryDot } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";
import { Segmented } from "../ui/segmented";
import { useMoney } from "../providers/money";
import { StarButton } from "../ui/row-bits";
import { SellerTable, SOURCE_LABEL, SOURCE_SLOT, sourceLabel } from "./seller-table";

export function ProductView({ product, listings, summary, history }: { product: Product; listings: Listing[]; summary: ProductSummary | null; history: { d: string; all: number | null; Chennai: number | null; Mumbai: number | null }[] }) {
  const money = useMoney();
  const [region, setRegion] = useState("all");
  const [src, setSrc] = useState<"all" | "indiamart" | "tradeindia" | "exportersindia">("all");
  const [kind, setKind] = useState<"all" | "manufacturer" | "trader">("all");
  const [priced, setPriced] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState("");
  const cat = categoryById[product.category];
  const chem = product.chem ? chemicalById[product.chem] : null;

  const base = useMemo(() => listings.filter((l) => showInactive || l.active), [listings, showInactive]);
  const filtered = useMemo(
    () =>
      base.filter(
        (l) =>
          (region === "all" || l.region === region) &&
          (src === "all" || l.src === src) &&
          (kind === "all" || (kind === "manufacturer" ? l.types?.manufacturer || l.flags.includes("manufacturer-claimed") : l.types?.trader || l.types?.distributor || l.flags.includes("trader-likely"))) &&
          (!priced || l.priceKg != null) &&
          (!q || `${l.company} ${l.city} ${l.title}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [base, region, src, kind, priced, q],
  );

  const regionList = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of base) m.set(l.region, (m.get(l.region) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (FOCUS_REGIONS.includes(b[0]) ? 1e6 : b[1]) - (FOCUS_REGIONS.includes(a[0]) ? 1e6 : a[1]) || FOCUS_REGIONS.indexOf(a[0]) - FOCUS_REGIONS.indexOf(b[0]));
  }, [base]);

  const groups = regionList.filter(([g]) => base.some((l) => l.region === g && l.priceKg != null)).slice(0, 10).map(([g]) => g);
  const plotted = base.filter((l) => l.priceKg != null && groups.includes(l.region) && (src === "all" || l.src === src));
  const medians = Object.fromEntries(groups.map((g) => [g, statsOf(base.filter((l) => l.region === g && (src === "all" || l.src === src))).median]));
  const stats = statsOf(filtered);
  const all = statsOf(base);
  const ch = statsOf(base.filter((l) => l.region === "Chennai"));
  const mu = statsOf(base.filter((l) => l.region === "Mumbai"));
  const regionBars = regionList
    .map(([g]) => ({ g, s: statsOf(base.filter((l) => l.region === g)) }))
    .filter((x) => x.s.median != null && x.s.credible >= 2)
    .sort((a, b) => a.s.median! - b.s.median!)
    .slice(0, 12);

  const historyLines = [
    { id: "all", name: "All India", slot: 1, points: history.filter((h) => h.all != null).map((h) => ({ d: h.d, v: h.all! })) },
    { id: "ch", name: "Chennai", slot: 2, points: history.filter((h) => h.Chennai != null).map((h) => ({ d: h.d, v: h.Chennai! })) },
    { id: "mu", name: "Mumbai", slot: 3, points: history.filter((h) => h.Mumbai != null).map((h) => ({ d: h.d, v: h.Mumbai! })) },
  ].filter((l) => l.points.length);

  return (
    <Reveal className="space-y-6">
      <div data-reveal>
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <Link href="/suppliers" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Suppliers
          </Link>
          <span className="text-muted">/</span>
          <span className="inline-flex items-center gap-1.5">
            <CategoryDot slot={cat.slot} /> {cat.name}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-[28px] font-semibold tracking-tight text-ink">
              {product.name}: sellers & asking prices <StarButton id={product.id} name={`${product.name} seller prices`} kind="product" />
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">
              Every seller listing found for this product on IndiaMART, TradeIndia and ExportersIndia (including prices from imported briefs), converted to {money.kgUnit} where possible. Each seller counts once per city. Asking prices are what sellers advertise, not deal prices.
              {chem && (
                <>
                  {" "}
                  Market data:{" "}
                  <Link href={`/chemical/${chem.id}`} className="font-medium text-accent-ink hover:underline">
                    {chem.name} →
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Sellers" value={new Set(base.map((l) => l.companyKey)).size} sub={`${base.length} listings · ${all.credible} with usable ${money.kgUnit}`} info={<p>Distinct companies with an active listing (seen in the last 30 days). Listings without a price or with lab/small packs are kept but not used for the medians.</p>} />
        <StatTile label="Typical ask, all India" value={all.median != null ? money.kg(all.median, 0) : "–"} sub={all.p25 != null ? `middle half ${money.kg(all.p25, 0)}–${money.kg(all.p75!, 0)} per kg` : "per kg"} info={<p>The median asking price in ₹/kg: half of sellers ask less, half more. The range covers the middle 50% of sellers.</p>} />
        <StatTile label="Chennai" value={ch.median != null ? money.kg(ch.median, 0) : "–"} sub={`${ch.credible} priced sellers`} />
        <StatTile label="Mumbai" value={mu.median != null ? money.kg(mu.median, 0) : "–"} sub={`${mu.credible} priced sellers`} />
        <StatTile
          label="vs India import price"
          value={summary?.markup != null ? fmtPct(summary.markup, 0) : "–"}
          sub={summary?.importPrice ? `import ${money.kg(summary.importPrice, 0)}/kg, ${fmtDate(summary.importMonth, "month")}` : "no import price"}
          info={<p>How far the typical asking price sits above the average price India paid for imports (customs value, before duty, freight inland, margin and GST). A big gap can mean room to negotiate or a local shortage.</p>}
        />
      </div>

      <Card
        title="Asking prices by city"
        subtitle="Each dot is one seller · black bar = median · line = India's average import price"
        info={
          <>
            <p>Dots show every seller with a price that converts to ₹/kg. Colour shows where the listing came from (legend below). Hollow dots are left out of the medians: lab packs, small packs, or prices more than 3× away from the typical seller.</p>
            <p>Towns are grouped into trading regions (e.g. Thane and Navi Mumbai count as Mumbai).</p>
          </>
        }
        exportName={`${product.id}-asks-by-city`}
        csv={() => ({ header: ["Region", "Seller", "City", "Listing", "Rs/kg", "Source", "Counted in median"], rows: plotted.map((l) => [l.region, l.company, l.city, l.title, l.priceKg, sourceLabel(l), l.credible ? "yes" : "no"]) })}
        actions={
          <Segmented
            ariaLabel="Source"
            size="sm"
            value={src}
            onChange={setSrc}
            options={[
              { value: "all", label: "All sources" },
              { value: "indiamart", label: "IndiaMART" },
              { value: "tradeindia", label: "TradeIndia" },
              { value: "exportersindia", label: "ExportersIndia" },
            ]}
          />
        }
      >
        {plotted.length ? (
          <>
            <StripPlot
              groups={groups}
              medians={Object.fromEntries(Object.entries(medians).map(([k, v]) => [k, v == null ? null : money.kgValue(v)]))}
              reference={summary?.importPrice != null ? money.kgValue(summary.importPrice) : null}
              symbol={money.symbol}
              referenceLabel="Import"
              dots={plotted.map((l) => ({ id: l.id, group: l.region, value: money.kgValue(l.priceKg!), label: l.company, sub: `${l.title}${l.city ? ` · ${l.city}` : ""} · ${sourceLabel(l)}`, slot: SOURCE_SLOT[l.src], hollow: !l.credible }))}
            />
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">
              {(["indiamart", "tradeindia", "exportersindia"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <i className="size-2.5 rounded-full" style={{ background: `var(--s${SOURCE_SLOT[s]})` }} /> {SOURCE_LABEL[s]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-full border-[1.5px] border-[var(--muted)]" /> not counted (outlier, lab / small pack, or the same seller&apos;s other listing)
              </span>
            </div>
          </>
        ) : (
          <p className="py-8 text-sm text-ink-2">No priced listings yet. The collector adds more cities every run.</p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Cheapest to dearest region" subtitle="Median asking price, regions with 2+ priced sellers" info={<p>Where this product is advertised cheapest. Small samples move a lot, so check the number of sellers in the table below.</p>} exportName={`${product.id}-regions`} csv={() => ({ header: ["Region", "Median Rs/kg", "Priced sellers"], rows: regionBars.map((r) => [r.g, r.s.median?.toFixed(2), r.s.credible]) })}>
          {regionBars.length ? <RankedBars data={regionBars.map((r) => ({ id: r.g, label: r.g, value: r.s.median!, display: `${money.kg(r.s.median!, 0)} · ${r.s.credible} sellers` }))} labelWidth={130} /> : <p className="text-sm text-ink-2">Not enough priced sellers per region yet.</p>}
        </Card>
        <Card title="Asking price over time" subtitle="Median of each seller's latest price" info={<p>Built from every price change the collector records. It starts with the first collection and fills in as sellers change their prices.</p>} png>
          {historyLines.some((l) => l.points.length > 1) ? <LinesChart unit={money.kgUnit} lines={historyLines.map((l) => ({ ...l, points: l.points.map((p) => ({ d: p.d, v: money.kgValue(p.v) })) }))} /> : <p className="py-8 text-sm text-ink-2">History builds as the collector re-reads listings each day. First reading: {fmtDate(history[0]?.d, "long")}.</p>}
        </Card>
      </div>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Store className="size-4 text-accent-ink" /> All sellers ({filtered.length})
          </span>
        }
        subtitle={stats.median != null ? `Median of shown sellers ${money.kg(stats.median, 0)}/kg · ${stats.manufacturers} manufacturers · ${stats.traders} traders` : undefined}
        png={false}
        exportName={`${product.id}-sellers`}
        csv={() => ({
          header: ["Company", "City", "Region", "Listing", "Asking price", "Rs/kg", "Counted in median", "Flags", "Member years", "GST verified", "Source", "First seen", "Last seen", "URL"],
          rows: filtered.map((l) => [l.company, l.city, l.region, l.title, l.priceText, l.priceKg, l.credible ? "yes" : "no", [...l.flags, l.outlier ? `outlier-${l.outlier}` : ""].filter(Boolean).join("; "), l.memberYears, l.gstVerified ? "yes" : "", sourceLabel(l), l.firstSeen.slice(0, 10), l.lastSeen.slice(0, 10), l.url]),
        })}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a seller or city…" className="input pl-9" aria-label="Find a seller" />
          </div>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="input h-9 w-auto" aria-label="Region">
            <option value="all">All regions ({base.length})</option>
            {regionList.map(([g, n]) => (
              <option key={g} value={g}>
                {g} ({n})
              </option>
            ))}
          </select>
          <Segmented
            ariaLabel="Seller type"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All types" },
              { value: "manufacturer", label: "Manufacturers" },
              { value: "trader", label: "Traders" },
            ]}
          />
          <button type="button" className="chip h-8!" data-on={priced} onClick={() => setPriced(!priced)}>
            With {money.kgUnit} only
          </button>
          <button type="button" className="chip h-8!" data-on={showInactive} onClick={() => setShowInactive(!showInactive)}>
            Include not seen lately
          </button>
          <InfoTip title="Seller table">
            <p>Click a column to sort. “vs median” compares each seller with the typical asking price for this product (green = cheaper).</p>
            <p>Faded rows are not counted in the medians. Open the source link to contact a seller on the marketplace.</p>
          </InfoTip>
        </div>
        <SellerTable listings={filtered} medianByProduct={{ [product.id]: all.median }} />
      </Card>
    </Reveal>
  );
}
