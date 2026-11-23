import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";

/** Called by the collector after a run that changed prices, so pages refresh at once. */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = req.headers.get("x-revalidate-secret") ?? "";
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  revalidateTag("market", { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: "market" });
}
