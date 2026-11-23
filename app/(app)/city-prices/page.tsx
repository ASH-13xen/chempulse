import type { Metadata } from "next";
import { CityPricesView } from "@/components/sellers/city-prices-view";
import { getSellerBoard } from "@/lib/sellers";

export const metadata: Metadata = { title: "City prices" };

export default async function CityPricesPage() {
  return <CityPricesView board={await getSellerBoard()} />;
}
