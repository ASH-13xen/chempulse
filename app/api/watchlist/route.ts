import { revalidateTag } from "next/cache";
import { connection, NextResponse, type NextRequest } from "next/server";
import { getDb, hasMongo } from "@/lib/db";

const KINDS = new Set(["chem", "market", "product", "supplier"]);
type Item = { t: string; id: string; addedAt: string };

async function col() {
  return (await getDb()).collection<{ _id: string; items: Item[] }>("watchlist");
}

/** The single user's watchlist: chemicals, markets, seller products and suppliers. */
export async function GET() {
  await connection();
  if (!hasMongo()) return NextResponse.json({ error: "Watchlist needs MongoDB." }, { status: 400 });
  const doc = await (await col()).findOne({ _id: "default" });
  return NextResponse.json({ items: doc?.items ?? [] });
}

export async function POST(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json({ error: "Watchlist needs MongoDB." }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { t?: string; id?: string } | null;
  const t = String(b?.t ?? "");
  const id = String(b?.id ?? "").slice(0, 120);
  if (!KINDS.has(t) || !id) return NextResponse.json({ error: "Bad item." }, { status: 400 });
  const c = await col();
  const doc = await c.findOne({ _id: "default" });
  if (!doc?.items.some((i) => i.t === t && i.id === id)) {
    await c.updateOne({ _id: "default" }, { $push: { items: { t, id, addedAt: new Date().toISOString() } } }, { upsert: true });
  }
  revalidateTag("watchlist", { expire: 0 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json({ error: "Watchlist needs MongoDB." }, { status: 400 });
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  await (await col()).updateOne({ _id: "default" }, { $pull: { items: { t, id } } });
  revalidateTag("watchlist", { expire: 0 });
  return NextResponse.json({ ok: true });
}
