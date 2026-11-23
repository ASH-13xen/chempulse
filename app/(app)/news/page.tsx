import type { Metadata } from "next";
import { NewsView } from "@/components/news/news-view";
import { getNews } from "@/lib/repo";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  return <NewsView news={await getNews(600)} />;
}
