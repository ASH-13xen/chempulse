import type { Metadata } from "next";
import { SuppliersView } from "@/components/sellers/suppliers-view";
import { getSellerBoard } from "@/lib/sellers";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  return <SuppliersView board={await getSellerBoard()} />;
}
