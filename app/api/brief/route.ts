import { createHash } from "crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { parseBrief } from "@/lib/brief-parser";
import { getDb, hasMongo } from "@/lib/db";
import { productById } from "@/lib/products";
import { regionOf } from "@/lib/regions";

/** Same normalisation as the Python collector (collector/store.py company_key). */
function companyKey(name: string) {
  const n = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(m\/s|messrs|pvt|private|ltd|limited|llp|opc|co|company|corp|corporation|inc|the)\b\.?/g, " ");
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const KEEP_FLAGS = new Set(["trader-likely", "manufacturer-claimed", "reprocessed", "gst-included"]);

/**
 * POST { text, save?: boolean, date?: string, source?: "indiamart" | "tradeindia" }
 *  - without save: returns the parsed rows for preview
 *  - with save: brief prices are filed under the marketplace they came from (default IndiaMART).
 *    If that seller already has a listing for the product in the same city region, the brief
 *    price is added to that listing's price history (and becomes its current price if the brief
 *    is newer). Otherwise a new listing is created and marked "via brief".
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { text?: string; save?: boolean; date?: string; source?: string } | null;
  const text = (body?.text ?? "").slice(0, 400_000);
  if (text.trim().length < 40) return NextResponse.json({ error: "Paste the brief text first." }, { status: 400 });
  const parsed = parseBrief(text);
  const date = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : (parsed.date ?? new Date().toISOString().slice(0, 10));
  if (!body?.save) return NextResponse.json({ ...parsed, date });
  if (!hasMongo()) return NextResponse.json({ error: "Saving needs MongoDB (MONGODB_URI)." }, { status: 400 });
  if (!parsed.rows.length) return NextResponse.json({ error: "No seller rows were found in this text." }, { status: 400 });
  const src = body.source === "tradeindia" ? "tradeindia" : "indiamart";

  const db = await getDb();
  const listings = db.collection("listings");
  const prices = db.collection("listing_prices");
  const briefId = `brief-${date}-${createHash("sha1").update(text).digest("hex").slice(0, 8)}`;
  let created = 0;
  let merged = 0;
  let changed = 0;
  let same = 0;

  for (const r of parsed.rows) {
    const ck = companyKey(r.company);
    const seenOn = r.pageDate ?? date;
    const seen = new Date(`${seenOn}T12:00:00Z`);
    const hist = { d: seenOn, price: r.price, unit: r.unit, priceKg: r.priceKg, product: r.product, via: "brief", briefId };
    const keepFlags = r.flags.filter((f) => KEEP_FLAGS.has(f));

    // 1) an existing marketplace listing for the same seller, product and city region
    const candidates = await listings.find({ src, companyKey: ck, product: r.product, via: { $ne: "brief" } }).toArray();
    const target = candidates.find((c) => regionOf(String(c.city ?? "")) === regionOf(r.city));
    if (target) {
      const dup = await prices.findOne({ l: target._id, briefId });
      if (!dup) await prices.insertOne({ l: target._id, ...hist });
      const newer = !target.changedAt || seen > new Date(target.changedAt);
      await listings.updateOne(
        { _id: target._id },
        {
          $set: { briefNote: r.note, briefPrice: r.priceText, briefId, briefDate: seenOn, ...(newer && r.price != null ? { price: r.price, unit: r.unit, priceKg: r.priceKg, priceText: r.priceText, changedAt: seen, lastSeen: seen } : {}) },
          $addToSet: { flags: { $each: keepFlags } },
        },
      );
      merged++;
      continue;
    }

    // 2) a listing created from an earlier brief for the same seller/product/city/title
    const id = `${src}:brief:${r.product}:${ck}:${slug(regionOf(r.city))}:${slug(r.title)}`;
    const doc = {
      src,
      via: "brief",
      product: r.product,
      chem: productById[r.product]?.chem ?? null,
      category: r.category,
      title: r.title,
      company: r.company,
      companyKey: ck,
      city: r.city,
      state: "",
      price: r.price,
      unit: r.unit,
      priceKg: r.priceKg,
      priceText: r.priceText,
      pack: "",
      grade: "",
      flags: r.flags,
      memberYears: null,
      gstVerified: false,
      rating: null,
      ratings: null,
      types: { trader: r.flags.includes("trader-likely"), manufacturer: r.flags.includes("manufacturer-claimed") },
      url: "",
      note: r.note,
      briefId,
    };
    const old = await listings.findOne({ _id: id as never });
    if (!old) {
      await listings.insertOne({ _id: id as never, ...doc, firstSeen: seen, lastSeen: seen, changedAt: seen });
      await prices.insertOne({ l: id, ...hist });
      created++;
    } else if (old.price !== r.price || old.unit !== r.unit) {
      const newer = seen > new Date(old.changedAt);
      await listings.updateOne({ _id: id as never }, { $set: newer ? { ...doc, lastSeen: seen, changedAt: seen } : { note: r.note } });
      await prices.insertOne({ l: id, ...hist });
      changed++;
    } else {
      await listings.updateOne({ _id: id as never }, { $max: { lastSeen: seen }, $set: { note: r.note, flags: r.flags } });
      same++;
    }
  }

  await db.collection("briefs").updateOne(
    { _id: briefId as never },
    { $set: { date, title: parsed.title, text, source: src, rows: parsed.rows.length, matched: parsed.rows.filter((r) => r.matched).length, importedAt: new Date() } },
    { upsert: true },
  );
  revalidateTag("sellers", { expire: 0 });
  return NextResponse.json({ ok: true, briefId, date, source: src, rows: parsed.rows.length, created, merged, changed, unchanged: same });
}
