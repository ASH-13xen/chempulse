"use client";

import { ArrowLeft, BadgeCheck, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { fmtDate, fmtPct } from "@/lib/format";
import { productById } from "@/lib/products";
import type { Company, Listing } from "@/lib/seller-stats";
import { RankedBars } from "../charts/bars";
import { useMoney } from "../providers/money";
import { Card, StatTile } from "../ui/card";
import { Reveal } from "../ui/motion";
import { StarButton } from "../ui/row-bits";
import { SellerTable, SOURCE_LABEL, sourceLabel } from "./seller-table";

export function CompanyView({ company, listings, medians }: { company: Company; listings: Listing[]; medians: Record<string, number | null> }) {
  const money = useMoney();
  const compared = listings
    .filter((l) => l.credible && medians[l.product])
    .map((l) => ({ l, pct: (l.priceKg! / medians[l.product]! - 1) * 100 }))
    .sort((a, b) => a.pct - b.pct);
  const avg = compared.length ? compared.reduce((a, x) => a + x.pct, 0) / compared.length : null;

  return (
    <Reveal className="space-y-6">
      <div data-reveal>
        <Link href="/suppliers" className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Suppliers
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-[1.75rem] font-semibold tracking-tight text-ink">
          {company.name}
          <StarButton id={company.key} name={company.name} kind="supplier" />
          {company.gstVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-wash px-2 py-0.5 text-xs font-semibold text-accent-ink">
              <BadgeCheck className="size-3.5" /> Verified
            </span>
          )}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {company.cities.join(", ")}
          </span>
          <span>{[company.types.manufacturer && "Manufacturer", (company.types.trader || company.types.distributor) && "Trader / distributor", company.types.exporter && "Exporter"].filter(Boolean).join(" · ") || "Type not stated"}</span>
          <span>Seen on {company.sources.map((s) => SOURCE_LABEL[s]).join(", ")}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Products listed" value={company.products.length} sub={`${company.listings} listings, ${company.priced} with a price`} />
        <StatTile label="Years on marketplace" value={company.memberYears ?? "–"} />
        <StatTile
          label="Rating"
          value={
            company.rating ? (
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-6 fill-[var(--warn)] text-[var(--warn)]" />
                {company.rating.toFixed(1)}
              </span>
            ) : (
              "–"
            )
          }
          sub={company.ratings ? `${company.ratings} buyer ratings (IndiaMART)` : "no ratings collected"}
        />
        <StatTile
          label="Price level vs other sellers"
          value={avg == null ? "–" : fmtPct(avg, 0)}
          tone={avg == null ? undefined : avg > 0 ? "down" : "up"}
          sub={avg == null ? "no comparable prices" : avg > 0 ? "dearer than the typical seller" : "cheaper than the typical seller"}
          info={<p>Average gap between this company&apos;s ₹/kg asking prices and the median asking price of all sellers of the same product. Negative = cheaper.</p>}
        />
      </div>

      {compared.length > 0 && (
        <Card title="Compared with the market" subtitle="This seller's ₹/kg vs the median of all sellers of the same product" info={<p>Green bars: cheaper than the typical seller. Red bars: dearer. Lab packs, small packs and outliers are not compared.</p>} exportName={`${company.key}-vs-market`}>
          <RankedBars
            diverging
            labelWidth={220}
            data={compared.map((x) => ({
              id: x.l.id,
              label: `${productById[x.l.product]?.name ?? x.l.product} · ${x.l.region}`,
              value: -x.pct,
              display: `${money.kg(x.l.priceKg!, 0)} vs ${money.kg(medians[x.l.product]!, 0)} (${fmtPct(x.pct, 0)})`,
            }))}
          />
          <p className="mt-2 text-xs text-muted">Bars point right when the seller is cheaper than the market median.</p>
        </Card>
      )}

      <Card title="All listings" subtitle={`First seen ${fmtDate(company.firstSeen.slice(0, 10), "long")} · last seen ${fmtDate(company.lastSeen.slice(0, 10), "long")}`} png={false} exportName={`${company.key}-listings`} csv={() => ({ header: ["Product", "Listing", "City", "Asking price", "Rs/kg", "Source", "URL"], rows: listings.map((l) => [productById[l.product]?.name ?? l.product, l.title, l.city, l.priceText, l.priceKg, sourceLabel(l), l.url]) })}>
        <SellerTable listings={listings} showProduct linkCompany={false} medianByProduct={medians} />
      </Card>
    </Reveal>
  );
}
