import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompanyView } from "@/components/sellers/company-view";
import { PageSkeleton } from "@/components/ui/skeleton";
import { getEnrichedListings, getSellerBoard } from "@/lib/sellers";

export const metadata: Metadata = { title: "Supplier" };

async function Content({ params }: { params: PageProps<"/suppliers/[key]">["params"] }) {
  const { key } = await params;
  const [board, listings] = await Promise.all([getSellerBoard(), getEnrichedListings()]);
  const company = board.companies.find((c) => c.key === key);
  const mine = listings.filter((l) => l.companyKey === key);
  if (!company && !mine.length) notFound();
  const medians = Object.fromEntries(board.products.map((p) => [p.id, p.stats.median]));
  const fallback = {
    key,
    name: mine[0]?.company ?? key,
    cities: [...new Set(mine.map((l) => l.city))],
    regions: [...new Set(mine.map((l) => l.region))],
    products: [...new Set(mine.map((l) => l.product))],
    categories: [...new Set(mine.map((l) => l.category))],
    types: { manufacturer: false, trader: false, distributor: false, exporter: false },
    sources: [...new Set(mine.map((l) => l.src))],
    listings: mine.length,
    priced: mine.filter((l) => l.priceKg != null).length,
    gstVerified: false,
    memberYears: null,
    rating: null,
    ratings: null,
    firstSeen: mine.map((l) => l.firstSeen).sort()[0] ?? "",
    lastSeen: mine.map((l) => l.lastSeen).sort().at(-1) ?? "",
  };
  return <CompanyView company={company ?? fallback} listings={mine} medians={medians} />;
}

export default function SupplierPage({ params }: PageProps<"/suppliers/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
