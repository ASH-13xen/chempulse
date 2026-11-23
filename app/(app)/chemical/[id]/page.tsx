import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { notFound } from "next/navigation";
import { ChemicalView } from "@/components/chemical/chemical-view";
import { chemicalById, chemicals } from "@/lib/catalog";
import { getDetail } from "@/lib/detail";
import { getQuotes, storageMode } from "@/lib/repo";
import { getSellerBoard } from "@/lib/sellers";

export function generateStaticParams() {
  return chemicals.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/chemical/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: chemicalById[id]?.name ?? "Chemical" };
}

export default function ChemicalPage({ params }: PageProps<"/chemical/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChemicalContent params={params} />
    </Suspense>
  );
}

async function ChemicalContent({ params }: { params: PageProps<"/chemical/[id]">["params"] }) {
  const { id } = await params;
  if (!chemicalById[id]) notFound();
  const [detail, quotes, storage, sellers] = await Promise.all([getDetail(id), getQuotes(id), storageMode(), getSellerBoard()]);
  if (!detail) notFound();
  return <ChemicalView detail={detail} quotes={quotes} storage={storage} sellerProducts={sellers.products.filter((p) => p.chem === id)} />;
}
