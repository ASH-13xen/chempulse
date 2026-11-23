import type { Metadata } from "next";
import { BriefImportView } from "@/components/sellers/brief-import-view";
import { getBriefs, storageMode } from "@/lib/repo";

export const metadata: Metadata = { title: "Import a brief" };

export default async function BriefImportPage() {
  const [briefs, storage] = await Promise.all([getBriefs(), storageMode()]);
  return <BriefImportView briefs={briefs} storage={storage} />;
}
