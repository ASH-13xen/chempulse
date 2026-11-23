import { Dashboard } from "@/components/dashboard/dashboard";
import { getBoard } from "@/lib/board";
import { getNews } from "@/lib/repo";

export default async function OverviewPage() {
  const [board, news] = await Promise.all([getBoard(), getNews(12)]);
  return <Dashboard board={board} news={news} />;
}
