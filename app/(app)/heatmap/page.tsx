import type { Metadata } from "next";
import { HeatmapView } from "@/components/heatmap/heatmap-view";
import { getBoard } from "@/lib/board";
import { getHeat } from "@/lib/heat";

export const metadata: Metadata = { title: "Heatmap" };

export default async function HeatmapPage() {
  const [board, heat] = await Promise.all([getBoard(), getHeat()]);
  return <HeatmapView board={board} heat={heat} />;
}
