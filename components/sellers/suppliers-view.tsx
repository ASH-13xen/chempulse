"use client";

import { ArrowDown, ArrowUp, BadgeCheck, Download, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categories, categoryById } from "@/lib/catalog";
import { downloadCsv } from "@/lib/download";
import { fmtDate, fmtNum } from "@/lib/format";
import { productById } from "@/lib/products";
import { FOCUS_REGIONS } from "@/lib/regions";
import type { Company, SellerBoard } from "@/lib/seller-stats";
import { RankedBars } from "../charts/bars";
import { Card, StatTile } from "../ui/card";
import { CategoryDot } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { CountUp, Reveal } from "../ui/motion";
import { Segmented } from "../ui/segmented";
import { StarButton } from "../ui/row-bits";
import { SOURCE_LABEL, SOURCE_SLOT } from "./seller-table";

type SortKey = "name" | "listings" | "products" | "memberYears" | "lastSeen";

export function SuppliersView({ board }: { board: SellerBoard }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [cat, setCat] = useState("all");
  const [product, setProduct] = useState("all");
  const [kind, setKind] = useState<"all" | "manufacturer" | "trader">("all");
  const [src, setSrc] = useState("all");
  const [gst, setGst] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "listings", dir: -1 });
  const [limit, setLimit] = useState(150);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = board.companies.filter(
      (c) =>
        (!s || `${c.name} ${c.cities.join(" ")}`.toLowerCase().includes(s)) &&
        (region === "all" || c.regions.includes(region)) &&
        (cat === "all" || c.categories.includes(cat)) &&
        (product === "all" || c.products.includes(product)) &&
        (kind === "all" || (kind === "manufacturer" ? c.types.manufacturer : c.types.trader || c.types.distributor)) &&
        (src === "all" || c.sources.includes(src)) &&
        (!gst || c.gstVerified),
    );
    const v = (c: Company) => (sort.k === "name" ? c.name.toLowerCase() : sort.k === "products" ? c.products.length : sort.k === "memberYears" ? (c.memberYears ?? -1) : sort.k === "lastSeen" ? c.lastSeen : c.listings);
    return out.sort((a, b) => {
      const av = v(a);
      const bv = v(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [board.companies, q, region, cat, product, kind, src, gst, sort]);

  const topRegions = board.regions.slice(0, 12);
  const manufacturers = board.companies.filter((c) => c.types.manufacturer).length;
  const chennai = board.companies.filter((c) => c.regions.includes("Chennai")).length;
  const mumbai = board.companies.filter((c) => c.regions.includes("Mumbai")).length;

  const th = (k: SortKey, label: string, right = false) => (
    <th className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-xs font-medium whitespace-nowrap text-muted ${right ? "text-right" : "text-left"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((x) => ({ k, dir: x.k === k ? ((x.dir * -1) as 1 | -1) : k === "name" ? 1 : -1 }))}>
        {label}
        {sort.k === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <Reveal className="space-y-6">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Suppliers</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Every company found selling a tracked product on IndiaMART, TradeIndia or ExportersIndia (prices from imported briefs count as IndiaMART). The collector re-reads each product and city page about once a day and adds new sellers as they appear.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            downloadCsv(
              `chempulse-suppliers-${new Date().toISOString().slice(0, 10)}.csv`,
              ["Company", "Cities", "Regions", "Products", "Manufacturer", "Trader/distributor", "Exporter", "GST verified", "Years on marketplace", "Rating", "Listings", "Priced listings", "Sources", "First seen", "Last seen"],
              list.map((c) => [c.name, c.cities.join("; "), c.regions.join("; "), c.products.map((p) => productById[p]?.name ?? p).join("; "), c.types.manufacturer ? "yes" : "", c.types.trader || c.types.distributor ? "yes" : "", c.types.exporter ? "yes" : "", c.gstVerified ? "yes" : "", c.memberYears, c.rating?.toFixed(1), c.listings, c.priced, c.sources.map((s) => SOURCE_LABEL[s]).join("; "), c.firstSeen.slice(0, 10), c.lastSeen.slice(0, 10)]),
            )
          }
        >
          <Download className="size-4" /> Export ({list.length})
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Companies" value={<CountUp value={board.totals.companies} format={(v) => fmtNum(v, { digits: 0 })} />} sub={`${fmtNum(board.totals.active, { digits: 0 })} active listings`} info={<p>Distinct companies with at least one listing seen in the last 30 days. The same name in two cities is counted once.</p>} />
        <StatTile label="In Chennai" value={<CountUp value={chennai} format={(v) => fmtNum(v, { digits: 0 })} />} sub="including Kanchipuram, Tiruvallur…" />
        <StatTile label="In Mumbai" value={<CountUp value={mumbai} format={(v) => fmtNum(v, { digits: 0 })} />} sub="including Thane, Navi Mumbai, Bhiwandi…" />
        <StatTile label="Manufacturers" value={<CountUp value={manufacturers} format={(v) => fmtNum(v, { digits: 0 })} />} sub={`${board.totals.companies - manufacturers} traders / distributors / unknown`} info={<p>As listed on the marketplace (TradeIndia flags manufacturer/trader; briefs note “deals in” for likely traders). Not independently verified.</p>} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Where the sellers are" subtitle="Active listings by trading region" exportName="sellers-by-region" csv={() => ({ header: ["Region", "Listings"], rows: board.regions.map((r) => [r.region, r.n]) })}>
          <RankedBars data={topRegions.map((r) => ({ id: r.region, label: r.region, value: r.n, display: fmtNum(r.n, { digits: 0 }), slot: FOCUS_REGIONS.includes(r.region) ? 2 : 1 }))} labelWidth={140} />
        </Card>
        <Card className="xl:col-span-3" title="Coverage by source" subtitle="Listings collected per marketplace" info={<p>IndiaMART is read slowly because it limits fast visitors; a full pass over every product and city takes about three days. TradeIndia and ExportersIndia are read daily. Prices from pasted briefs are filed under IndiaMART, where they came from.</p>} png={false}>
          <div className="grid grid-cols-3 gap-3">
            {(["indiamart", "tradeindia", "exportersindia"] as const).map((s) => (
              <div key={s} className="rounded-xl bg-surface-2 p-4">
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <i className="size-2.5 rounded-full" style={{ background: `var(--s${SOURCE_SLOT[s]})` }} /> {SOURCE_LABEL[s]}
                </div>
                <div className="mt-1 text-2xl font-semibold text-ink">{fmtNum(board.totals.bySource[s] ?? 0, { digits: 0 })}</div>
                <div className="text-xs text-muted">listings{s === "indiamart" && board.totals.viaBrief ? ` · ${board.totals.viaBrief} from briefs` : ""}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Last listing seen {board.lastSeen ? fmtDate(board.lastSeen.slice(0, 10), "long") : "–"}.</p>
        </Card>
      </div>

      <div data-reveal className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or city…" className="input pl-9" aria-label="Search suppliers" />
          </div>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="input h-9 w-auto" aria-label="Region">
            <option value="all">All regions</option>
            {board.regions.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region} ({r.n})
              </option>
            ))}
          </select>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="input h-9 w-auto" aria-label="Product">
            <option value="all">All products</option>
            {board.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.companies})
              </option>
            ))}
          </select>
          <Segmented
            ariaLabel="Type"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All types" },
              { value: "manufacturer", label: "Manufacturers" },
              { value: "trader", label: "Traders" },
            ]}
          />
          <select value={src} onChange={(e) => setSrc(e.target.value)} className="input h-9 w-auto" aria-label="Source">
            <option value="all">All sources</option>
            <option value="indiamart">IndiaMART</option>
            <option value="tradeindia">TradeIndia</option>
            <option value="exportersindia">ExportersIndia</option>
          </select>
          <button type="button" className="chip h-8!" data-on={gst} onClick={() => setGst(!gst)}>
            <BadgeCheck className="size-3.5" /> Verified only
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="chip h-7! text-xs!" data-on={cat === "all"} onClick={() => setCat("all")}>
            All categories
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip h-7! text-xs!" data-on={cat === c.id} onClick={() => setCat(c.id)}>
              <CategoryDot slot={c.slot} /> {c.name}
            </button>
          ))}
        </div>
      </div>

      <div data-reveal className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-ink-2">
          <span>
            <b className="text-ink">{fmtNum(list.length, { digits: 0 })}</b> companies
          </span>
          <InfoTip title="Supplier list">
            <p>Click a company to see every product it lists, its prices in ₹/kg and how they compare with other sellers.</p>
            <p>“Verified” means GST-verified on IndiaMART or a verified badge on TradeIndia.</p>
          </InfoTip>
        </div>
        <div className="max-h-[calc(100vh-240px)] overflow-auto">
          <table className="tnum w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {th("name", "Company")}
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-left text-xs font-medium text-muted">Where</th>
                {th("products", "Products")}
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-left text-xs font-medium text-muted">Type</th>
                {th("listings", "Listings", true)}
                {th("memberYears", "Years on site", true)}
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-right text-xs font-medium text-muted">Rating</th>
                <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-left text-xs font-medium text-muted">Sources</th>
                {th("lastSeen", "Seen", true)}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((c) => (
                <tr key={c.key} className="hover:bg-surface-2">
                  <td className="border-b border-line/60 px-3 py-2.5">
                    <span className="mr-1 inline-block align-middle">
                      <StarButton id={c.key} name={c.name} kind="supplier" />
                    </span>
                    <Link href={`/suppliers/${c.key}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-accent-ink hover:underline">
                      {c.name}
                      {c.gstVerified && <BadgeCheck className="size-3.5 text-accent-ink" aria-label="Verified" />}
                    </Link>
                  </td>
                  <td className="max-w-[220px] border-b border-line/60 px-3 py-2.5 text-ink-2">
                    <span className="line-clamp-1" title={c.cities.join(", ")}>
                      {c.regions.join(", ")}
                    </span>
                  </td>
                  <td className="max-w-[320px] border-b border-line/60 px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {c.products.slice(0, 4).map((p) => (
                        <Link key={p} href={`/products/${p}`} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2 hover:text-accent-ink">
                          <CategoryDot slot={categoryById[productById[p]?.category ?? "solvents"]?.slot ?? 1} className="size-1.5!" />
                          {productById[p]?.name ?? p}
                        </Link>
                      ))}
                      {c.products.length > 4 && <span className="text-[11px] text-muted">+{c.products.length - 4}</span>}
                    </span>
                  </td>
                  <td className="border-b border-line/60 px-3 py-2.5 text-xs whitespace-nowrap text-ink-2">{[c.types.manufacturer && "Manufacturer", (c.types.trader || c.types.distributor) && "Trader", c.types.exporter && "Exporter"].filter(Boolean).join(" · ") || "–"}</td>
                  <td className="border-b border-line/60 px-3 py-2.5 text-right text-ink">{c.listings}</td>
                  <td className="border-b border-line/60 px-3 py-2.5 text-right text-ink-2">{c.memberYears ?? "–"}</td>
                  <td className="border-b border-line/60 px-3 py-2.5 text-right whitespace-nowrap text-ink-2">
                    {c.rating ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 fill-[var(--warn)] text-[var(--warn)]" />
                        {c.rating.toFixed(1)}
                        {c.ratings ? <span className="text-muted">({c.ratings})</span> : null}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="border-b border-line/60 px-3 py-2.5 whitespace-nowrap">
                    <span className="flex gap-1">
                      {c.sources.map((s) => (
                        <i key={s} title={SOURCE_LABEL[s]} className="size-2.5 rounded-full" style={{ background: `var(--s${SOURCE_SLOT[s]})` }} />
                      ))}
                    </span>
                  </td>
                  <td className="border-b border-line/60 px-3 py-2.5 text-right whitespace-nowrap text-ink-2">{fmtDate(c.lastSeen.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > limit && (
            <div className="p-4 text-center">
              <button type="button" className="btn" onClick={() => setLimit((l) => l + 300)}>
                Show more ({fmtNum(list.length - limit, { digits: 0 })} left)
              </button>
            </div>
          )}
          {!list.length && <p className="p-12 text-center text-sm text-ink-2">No companies match these filters.</p>}
        </div>
      </div>
    </Reveal>
  );
}
