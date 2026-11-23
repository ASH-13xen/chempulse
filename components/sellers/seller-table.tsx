"use client";

import { ArrowDown, ArrowUp, BadgeCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDate, fmtPct } from "@/lib/format";
import { productById } from "@/lib/products";
import { useMoney } from "../providers/money";
import type { Listing } from "@/lib/seller-stats";

export const SOURCE_LABEL: Record<string, string> = { indiamart: "IndiaMART", tradeindia: "TradeIndia", exportersindia: "ExportersIndia" };
export const SOURCE_SLOT: Record<string, number> = { indiamart: 1, tradeindia: 2, exportersindia: 3 };

export function sourceLabel(l: { src: string; via?: string; briefDate?: string; firstSeen?: string }) {
  const base = SOURCE_LABEL[l.src] ?? l.src;
  return l.via === "brief" ? `${base} · via brief` : base;
}

/** The seller's own price wording, e.g. "₹42/Litre". */
function askText(l: Listing) {
  if (!l.priceText) return "Price on request";
  return l.priceText.startsWith("₹") || /^rs/i.test(l.priceText) ? l.priceText : `₹${l.priceText}${l.unit ? `/${l.unit}` : ""}`;
}

function SourceLink({ l }: { l: Listing }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <i aria-hidden className="size-2 rounded-full" style={{ background: `var(--s${SOURCE_SLOT[l.src]})` }} />
      {l.url ? (
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-ink hover:underline">
          {sourceLabel(l)} <ExternalLink className="size-3" />
        </a>
      ) : (
        <span title={l.via === "brief" ? `From the imported brief${l.firstSeen ? ` of ${fmtDate(l.firstSeen.slice(0, 10), "long")}` : ""}` : undefined}>{sourceLabel(l)}</span>
      )}
    </span>
  );
}

const FLAG_LABEL: Record<string, { label: string; title: string }> = {
  lab: { label: "Lab / small pack", title: "Laboratory grade or a small pack. Priced much higher than bulk, so left out of medians." },
  "small-pack": { label: "Small pack", title: "Pack of 5 kg / 5 L or less. Left out of medians." },
  "no-unit": { label: "No unit", title: "The listing gives a price without a unit, so it cannot be converted to ₹/kg." },
  "per-pack": { label: "Per pack", title: "Price was per drum/bag; converted with the stated pack size." },
  "per-litre": { label: "Per litre", title: "Price per litre with no known density, so not converted to ₹/kg." },
  outlier: { label: "Outlier", title: "Marked as an outlier in the source brief." },
  stale: { label: "Stale", title: "The source page was old when the brief was made." },
  "trader-likely": { label: "Likely trader", title: "Listed as 'deals in', which usually means a trader." },
  "manufacturer-claimed": { label: "Says manufacturer", title: "Describes itself as a manufacturer (not verified)." },
  reprocessed: { label: "Reprocessed?", title: "May be reprocessed material." },
  "gst-included": { label: "Incl. GST", title: "Price includes GST." },
  "foreign-currency": { label: "Price in USD", title: "The seller quotes in US dollars (often an export price), so it is not converted to ₹/kg." },
};

export function FlagChips({ l }: { l: Listing }) {
  const chips: { label: string; title: string; tone: "warn" | "muted" | "good" }[] = [];
  if (l.outlier) chips.push({ label: l.outlier === "high" ? "Far above median" : "Far below median", title: "More than 3× above or below the typical asking price for this product, so left out of medians. Often a unit error, a different grade, or a teaser price.", tone: "warn" });
  for (const f of l.flags) if (FLAG_LABEL[f]) chips.push({ ...FLAG_LABEL[f], tone: f === "outlier" || f === "lab" || f === "small-pack" ? "warn" : "muted" });
  if (l.types?.manufacturer && !l.flags.includes("manufacturer-claimed")) chips.push({ label: "Manufacturer", title: "Listed as a manufacturer on the marketplace.", tone: "good" });
  else if (l.types?.trader || l.types?.distributor) chips.push({ label: "Trader", title: "Listed as a trader / distributor.", tone: "muted" });
  if (l.duplicate) chips.push({ label: "Counted once", title: "This seller has another listing for the same product in the same region; only its most recent one is counted in medians.", tone: "muted" });
  if (l.briefPrice) chips.push({ label: `Brief: ${l.briefPrice}`, title: `Price in the imported brief${l.briefDate ? ` of ${fmtDate(l.briefDate, "long")}` : ""}. Kept in this listing's price history.${l.briefNote ? ` Note: ${l.briefNote}` : ""}`, tone: "muted" });
  if (!l.active) chips.push({ label: "Not seen lately", title: `Last seen ${fmtDate(l.lastSeen.slice(0, 10), "long")}.`, tone: "muted" });
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          title={c.title}
          className={`rounded px-1.5 py-px text-[0.625rem] font-semibold whitespace-nowrap ${c.tone === "warn" ? "bg-[color-mix(in_oklab,var(--warn)_20%,transparent)] text-ink" : c.tone === "good" ? "bg-[color-mix(in_oklab,var(--up)_12%,transparent)] text-up-ink" : "bg-surface-2 text-ink-2"}`}
        >
          {c.label}
        </span>
      ))}
    </span>
  );
}

type SortKey = "priceKg" | "company" | "region" | "lastSeen" | "memberYears" | "vsMedian";

export function SellerTable({ listings, medianByProduct, showProduct = false, linkCompany = true, max = 400 }: { listings: Listing[]; medianByProduct?: Record<string, number | null>; showProduct?: boolean; linkCompany?: boolean; max?: number }) {
  const money = useMoney();
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "priceKg", dir: 1 });
  const [shown, setShown] = useState(30); // phone card list grows in steps
  const rows = useMemo(() => {
    const val = (l: Listing): string | number | null => {
      if (sort.k === "vsMedian") {
        const m = medianByProduct?.[l.product];
        return m && l.priceKg ? l.priceKg / m - 1 : null;
      }
      return (l as unknown as Record<string, string | number | null>)[sort.k] ?? null;
    };
    return [...listings]
      .sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      })
      .slice(0, max);
  }, [listings, sort, medianByProduct, max]);

  const th = (k: SortKey, label: string, right = false) => (
    <th className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-xs font-medium whitespace-nowrap text-muted ${right ? "text-right" : "text-left"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((s.dir * -1) as 1 | -1) : k === "lastSeen" || k === "memberYears" ? -1 : 1 }))}>
        {label}
        {sort.k === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  const vsOf = (l: Listing) => {
    const m = medianByProduct?.[l.product];
    return m && l.priceKg && l.credible ? (l.priceKg / m - 1) * 100 : null;
  };

  return (
    <>
      {/* Phones: one compact card per listing, price on the right */}
      <div className="sm:hidden">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{rows.length} listings</span>
          <select
            className="input h-9! w-auto"
            aria-label="Sort sellers"
            value={`${sort.k}:${sort.dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":");
              setSort({ k: k as SortKey, dir: Number(d) as 1 | -1 });
            }}
          >
            <option value="priceKg:1">Cheapest first</option>
            <option value="priceKg:-1">Dearest first</option>
            {medianByProduct && <option value="vsMedian:1">Furthest below median</option>}
            <option value="lastSeen:-1">Recently seen</option>
            <option value="company:1">Name A–Z</option>
            <option value="region:1">City A–Z</option>
          </select>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {rows.slice(0, shown).map((l) => {
            const vs = vsOf(l);
            return (
              <li key={l.id} className={`py-3 ${l.credible || l.priceKg == null ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {linkCompany ? (
                        <Link href={`/suppliers/${l.companyKey}`} className="font-medium text-ink hover:text-accent-ink">
                          {l.company}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{l.company}</span>
                      )}
                      {l.gstVerified && <BadgeCheck className="size-3.5 shrink-0 text-accent-ink" aria-label="GST verified" />}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-2">
                      {l.region}
                      {l.city && l.city.toLowerCase() !== l.region.toLowerCase() && <span className="text-muted"> · {l.city}</span>}
                      {showProduct && (
                        <>
                          {" · "}
                          <Link href={`/products/${l.product}`} className="hover:text-accent-ink">
                            {productById[l.product]?.name ?? l.product}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum font-semibold text-ink">{l.priceKg != null ? `${money.kg(l.priceKg)}/kg` : "–"}</div>
                    <div className="text-[0.6875rem] text-muted">{askText(l)}</div>
                    {vs != null && <div className={`tnum text-xs font-medium ${vs > 0 ? "text-down-ink" : "text-up-ink"}`}>{fmtPct(vs, 0)} vs median</div>}
                  </div>
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-muted">
                  {l.title}
                  {l.pack && <> · {l.pack}</>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <FlagChips l={l} />
                  <SourceLink l={l} />
                  <span className="text-[0.6875rem] text-muted">seen {fmtDate(l.lastSeen.slice(0, 10))}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length > shown && (
          <button type="button" className="btn mt-2 w-full justify-center" onClick={() => setShown((n) => n + 30)}>
            Show 30 more ({rows.length - shown} left)
          </button>
        )}
        {!listings.length && <p className="px-3 py-10 text-center text-sm text-ink-2">No sellers match these filters.</p>}
      </div>

    <div className="hidden max-h-[620px] overflow-auto sm:block">
      <table className="tnum w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {th("company", "Seller")}
            {th("region", "City")}
            {showProduct && <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted">Product</th>}
            <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted">Listing</th>
            {th("priceKg", `Price ${money.kgUnit}`, true)}
            {medianByProduct && th("vsMedian", "vs median", true)}
            <th className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted">Notes</th>
            {th("lastSeen", "Source · seen")}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const vs = vsOf(l);
            return (
              <tr key={l.id} className={`hover:bg-surface-2 ${l.credible || l.priceKg == null ? "" : "opacity-70"}`}>
                <td className="border-b border-line/60 px-3 py-2">
                  <div className="flex min-w-[160px] items-center gap-1.5">
                    {linkCompany ? (
                      <Link href={`/suppliers/${l.companyKey}`} className="font-medium text-ink hover:text-accent-ink hover:underline">
                        {l.company}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{l.company}</span>
                    )}
                    {l.gstVerified && <BadgeCheck className="size-3.5 shrink-0 text-accent-ink" aria-label="GST verified" />}
                  </div>
                  {l.memberYears ? <div className="text-[0.6875rem] text-muted">{l.memberYears} yr on the marketplace</div> : null}
                </td>
                <td className="border-b border-line/60 px-3 py-2 whitespace-nowrap text-ink-2">
                  {l.region}
                  {l.city && l.city.toLowerCase() !== l.region.toLowerCase() && <div className="text-[0.6875rem] text-muted">{l.city}</div>}
                </td>
                {showProduct && (
                  <td className="border-b border-line/60 px-3 py-2 whitespace-nowrap">
                    <Link href={`/products/${l.product}`} className="text-ink-2 hover:text-accent-ink hover:underline">
                      {productById[l.product]?.name ?? l.product}
                    </Link>
                  </td>
                )}
                <td className="max-w-[230px] min-w-[150px] border-b border-line/60 px-3 py-2 text-ink-2">
                  <span className="line-clamp-2" title={[l.title, l.grade, l.pack].filter(Boolean).join(" · ")}>
                    {l.title}
                    {l.pack && <span className="text-muted"> · {l.pack}</span>}
                  </span>
                </td>
                <td className="border-b border-line/60 px-3 py-2 text-right whitespace-nowrap" title="Converted price per kg; the seller's own wording is underneath">
                  <div className="font-semibold text-ink">{l.priceKg != null ? money.kg(l.priceKg) : "–"}</div>
                  <div className="text-[0.6875rem] text-muted">{askText(l)}</div>
                </td>
                {medianByProduct && (
                  <td className={`border-b border-line/60 px-3 py-2 text-right whitespace-nowrap ${vs == null ? "text-muted" : vs > 0 ? "text-down-ink" : "text-up-ink"}`} title="Above median = dearer than the typical seller">
                    {vs == null ? "–" : fmtPct(vs, 0)}
                  </td>
                )}
                <td className="min-w-[120px] border-b border-line/60 px-3 py-2">
                  <FlagChips l={l} />
                  {l.note && <div className="mt-0.5 max-w-[240px] text-[0.6875rem] text-muted">{l.note}</div>}
                </td>
                <td className="border-b border-line/60 px-3 py-2 whitespace-nowrap">
                  <SourceLink l={l} />
                  <div className="pl-3.5 text-[0.6875rem] text-muted">seen {fmtDate(l.lastSeen.slice(0, 10))}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {listings.length > max && <p className="px-3 py-3 text-xs text-muted">Showing the first {max} of {listings.length}. Narrow the filters or download the CSV for all.</p>}
      {!listings.length && <p className="px-3 py-10 text-center text-sm text-ink-2">No sellers match these filters.</p>}
    </div>
    </>
  );
}
