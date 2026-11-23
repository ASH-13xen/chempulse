import type { Metadata } from "next";
import { MarketsView } from "@/components/markets/markets-view";
import { getBoard } from "@/lib/board";

export const metadata: Metadata = { title: "Markets & drivers" };

export default async function MarketsPage() {
  return <MarketsView board={await getBoard()} />;
}
