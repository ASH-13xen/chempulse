import type { Metadata } from "next";
import { DailyBriefView } from "@/components/sellers/daily-brief-view";
import { getDailyBrief } from "@/lib/daily-brief";
import { getBriefs } from "@/lib/repo";

export const metadata: Metadata = { title: "Daily brief" };

export default async function BriefPage() {
  const [brief, briefs] = await Promise.all([getDailyBrief(), getBriefs()]);
  return <DailyBriefView brief={brief} briefs={briefs} />;
}
