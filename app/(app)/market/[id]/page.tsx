import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { notFound } from "next/navigation";
import { ChemicalView } from "@/components/chemical/chemical-view";
import { marketById, markets } from "@/lib/catalog";
import { getDetail } from "@/lib/detail";

export function generateStaticParams() {
  return markets.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: PageProps<"/market/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: marketById[id]?.name ?? "Market" };
}

export default function MarketPage({ params }: PageProps<"/market/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MarketContent params={params} />
    </Suspense>
  );
}

async function MarketContent({ params }: { params: PageProps<"/market/[id]">["params"] }) {
  const { id } = await params;
  if (!marketById[id]) notFound();
  const detail = await getDetail(id);
  if (!detail) notFound();
  return <ChemicalView detail={detail} quotes={[]} storage="json" />;
}
