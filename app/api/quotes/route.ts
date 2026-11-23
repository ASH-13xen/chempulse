import { ObjectId } from "mongodb";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { chemicalById } from "@/lib/catalog";
import { getDb, hasMongo } from "@/lib/db";

const UNITS = new Set(["kg", "L", "t"]);
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json({ error: "Quotes need MongoDB (set MONGODB_URI)." }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chem = b && chemicalById[String(b.chem)];
  const price = Number(b?.price);
  const unit = String(b?.unit);
  const date = String(b?.date ?? "");
  if (!chem) return NextResponse.json({ error: "Unknown chemical." }, { status: 400 });
  if (!(price > 0 && price < 1e9)) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  if (!UNITS.has(unit)) return NextResponse.json({ error: "Unit must be kg, L or t." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  const pricePerKg = unit === "kg" ? price : unit === "t" ? price / 1000 : chem.density ? price / chem.density : null;
  const db = await getDb();
  const doc = {
    chem: chem.id,
    date,
    city: clip(b!.city, 40),
    supplier: clip(b!.supplier, 80),
    grade: clip(b!.grade, 60),
    price,
    unit,
    pricePerKg,
    note: clip(b!.note, 300),
    createdAt: new Date(),
  };
  const res = await db.collection("quotes").insertOne(doc);
  revalidateTag("quotes", { expire: 0 });
  return NextResponse.json({ ok: true, quote: { ...doc, id: String(res.insertedId), createdAt: doc.createdAt.toISOString() } });
}

export async function DELETE(req: NextRequest) {
  if (!hasMongo()) return NextResponse.json({ error: "Quotes need MongoDB." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const db = await getDb();
  await db.collection("quotes").deleteOne({ _id: new ObjectId(id) });
  revalidateTag("quotes", { expire: 0 });
  return NextResponse.json({ ok: true });
}
