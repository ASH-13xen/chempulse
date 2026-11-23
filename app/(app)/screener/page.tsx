import type { Metadata } from "next";
import { Screener } from "@/components/screener/screener";
import { getBoard } from "@/lib/board";

export const metadata: Metadata = { title: "Screener" };

export default async function ScreenerPage() {
  return <Screener board={await getBoard()} />;
}
