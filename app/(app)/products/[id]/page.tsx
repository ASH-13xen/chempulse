import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductView } from "@/components/sellers/product-view";
import { PageSkeleton } from "@/components/ui/skeleton";
import { productById, products } from "@/lib/products";
import { getListingPrices } from "@/lib/repo";
import { askHistory, getEnrichedListings, getSellerBoard } from "@/lib/sellers";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `${productById[id]?.name ?? "Product"} sellers` };
}

async function Content({ params }: { params: PageProps<"/products/[id]">["params"] }) {
  const { id } = await params;
  const product = productById[id];
  if (!product) notFound();
  const [listings, board, prices] = await Promise.all([getEnrichedListings(), getSellerBoard(), getListingPrices()]);
  const mine = listings.filter((l) => l.product === id);
  return <ProductView product={product} listings={mine} summary={board.products.find((p) => p.id === id) ?? null} history={askHistory(mine, prices, id)} />;
}

export default function ProductPage({ params }: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
