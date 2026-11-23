import type { Metadata } from "next";
import { ImportsView } from "@/components/imports/imports-view";
import { getImportsData } from "@/lib/imports-data";

export const metadata: Metadata = { title: "India imports" };

export default async function ImportsPage() {
  return <ImportsView data={await getImportsData()} />;
}
