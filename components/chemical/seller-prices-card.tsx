"use client";

import { Store } from "lucide-react";
import Link from "next/link";
import { fmtDate, fmtPct } from "@/lib/format";
import type { ProductSummary } from "@/lib/seller-stats";
import { useMoney } from "../providers/money";
import { Card } from "../ui/card";

/** Seller asking prices (marketplaces + briefs) for the products of one chemical. */
export function SellerPricesCard({ products }: { products: ProductSummary[] }) {
  const money = useMoney();
  const cell = (p: ProductSummary, region: string) => {
    const s = p.regions.find((r) => r.region === region)?.stats;
    return s?.median != null ? (
      <span>
        <b className="font-semibold text-ink">{money.kg(s.median, 0)}</b> <span className="text-muted">({s.credible})</span>
      </span>
    ) : (
      <span className="text-muted">–</span>
    );
  };
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Store className="size-4 text-accent-ink" /> Seller asking prices in India
        </span>
      }
      subtitle={`Median ${money.kgUnit} from IndiaMART, TradeIndia and ExportersIndia (number of priced sellers in brackets)`}
      info={<p>What Indian sellers advertise today, grouped into trading regions. Open a product for every seller, a price-by-city chart and the full table.</p>}
      exportName="seller-asking-prices"
      csv={() => ({ header: ["Product", "Sellers", "All India median", "Chennai median", "Mumbai median", "vs import price %"], rows: products.map((p) => [p.name, p.companies, p.stats.median?.toFixed(2), p.regions.find((r) => r.region === "Chennai")?.stats.median?.toFixed(2), p.regions.find((r) => r.region === "Mumbai")?.stats.median?.toFixed(2), p.markup?.toFixed(1)]) })}
    >
      <div className="overflow-x-auto">
        <table className="tnum w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 text-left font-medium">Product</th>
              <th className="py-2 pr-4 text-right font-medium">Sellers</th>
              <th className="py-2 pr-4 text-right font-medium">All India</th>
              <th className="py-2 pr-4 text-right font-medium">Chennai</th>
              <th className="py-2 pr-4 text-right font-medium">Mumbai</th>
              <th className="py-2 pr-4 text-right font-medium">vs import price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line/60 last:border-0">
                <td className="py-2 pr-4 font-medium text-ink">{p.name}</td>
                <td className="py-2 pr-4 text-right text-ink-2">{p.companies}</td>
                <td className="py-2 pr-4 text-right">{p.stats.median != null ? <b className="font-semibold text-ink">{money.kg(p.stats.median, 0)}</b> : "–"}</td>
                <td className="py-2 pr-4 text-right">{cell(p, "Chennai")}</td>
                <td className="py-2 pr-4 text-right">{cell(p, "Mumbai")}</td>
                <td className="py-2 pr-4 text-right text-ink-2" title={p.importMonth ? `Import price ${fmtDate(p.importMonth, "month")}` : undefined}>
                  {p.markup == null ? "–" : fmtPct(p.markup, 0)}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/products/${p.id}`} className="text-[0.8125rem] font-medium whitespace-nowrap text-accent-ink hover:underline">
                    All sellers →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
