import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/compare/compare-view";
import { PageSkeleton } from "@/components/ui/skeleton";
import { getBoard } from "@/lib/board";

export const metadata: Metadata = { title: "Compare" };

async function CompareContent({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const [board, sp] = await Promise.all([getBoard(), searchParams]);
  const raw = typeof sp.s === "string" ? sp.s : "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return <CompareView board={board} initial={ids} />;
}

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}
