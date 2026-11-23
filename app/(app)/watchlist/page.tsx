import type { Metadata } from "next";
import { WatchlistView } from "@/components/watchlist/watchlist-view";
import { getWatchView } from "@/lib/watchlist";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  return <WatchlistView view={await getWatchView()} />;
}
