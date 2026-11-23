import type { Metadata } from "next";
import { AlertsView } from "@/components/alerts/alerts-view";
import { getBoard } from "@/lib/board";

export const metadata: Metadata = { title: "Signals & alerts" };

export default async function AlertsPage() {
  return <AlertsView board={await getBoard()} />;
}
