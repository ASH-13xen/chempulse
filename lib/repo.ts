/**
 * Data access. Reads MongoDB when MONGODB_URI is set, otherwise the JSON files
 * the collector writes to data/snapshot (handy for local previews).
 * Everything here is cached and tagged "market"; the collector clears the tag
 * through /api/revalidate after a run that changed prices.
 */
import { promises as fs } from "fs";
import path from "path";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, hasMongo } from "./db";
import type { NewsItem, OriginRow, Point, Quote, Run, SeriesStatus } from "./types";

const SNAP = path.join(process.cwd(), "data", "snapshot");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(SNAP, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function dayString(t: Date) {
  return t.toISOString().slice(0, 10);
}

async function loadPoints(id: string, since?: string): Promise<Point[]> {
  if (hasMongo()) {
    const db = await getDb();
    const q: Record<string, unknown> = { s: id };
    if (since) q.t = { $gte: new Date(since + "T00:00:00Z") };
    const docs = await db
      .collection("points")
      .find(q, { projection: { _id: 0, s: 0 } })
      .sort({ t: 1 })
      .toArray();
    return docs.map(({ t, ...rest }) => ({ d: dayString(t as Date), v: null, ...rest }) as Point);
  }
  const raw = await readJson<{ cols: string[]; rows: (string | number | null)[][] } | null>(`points/${id}.json`, null);
  if (!raw) return [];
  const out: Point[] = [];
  for (const r of raw.rows) {
    const p: Record<string, unknown> = { v: null };
    raw.cols.forEach((c, i) => {
      if (r[i] != null) p[c] = r[i];
    });
    if (!since || (p.d as string) >= since) out.push(p as Point);
  }
  return out;
}

export async function getPoints(id: string, since?: string): Promise<Point[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  return loadPoints(id, since);
}

export async function getManyPoints(ids: string[], since?: string): Promise<Record<string, Point[]>> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  const entries = await Promise.all(ids.map(async (id) => [id, await loadPoints(id, since)] as const));
  return Object.fromEntries(entries);
}

export async function getSeriesStatus(): Promise<SeriesStatus> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("series").find({}).toArray();
    return Object.fromEntries(
      docs.map((d) => [
        String(d._id),
        {
          firstDate: d.firstDate ?? null,
          lastDate: d.lastDate ?? null,
          count: d.count ?? 0,
          changedAt: d.changedAt ? new Date(d.changedAt).toISOString() : null,
        },
      ]),
    );
  }
  const meta = await readJson<{ series: SeriesStatus }>("meta.json", { series: {} });
  return meta.series;
}

export async function getRuns(limit = 60): Promise<Run[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("runs").find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(({ at, ...rest }) => ({ ...(rest as unknown as Omit<Run, "at">), at: new Date(at).toISOString() }));
  }
  const meta = await readJson<{ runs: Run[] }>("meta.json", { runs: [] });
  return meta.runs.slice(0, limit);
}

export type OriginsByMonth = { month: string; rows: OriginRow[] }[];

export async function getOrigins(): Promise<Record<string, OriginsByMonth>> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("origins").find({}).sort({ month: -1 }).toArray();
    const out: Record<string, OriginsByMonth> = {};
    for (const d of docs) (out[d.chem] ??= []).push({ month: d.month, rows: d.rows as OriginRow[] });
    return out;
  }
  const raw = await readJson<Record<string, Record<string, OriginRow[]>>>("origins.json", {});
  return Object.fromEntries(
    Object.entries(raw).map(([chem, months]) => [
      chem,
      Object.entries(months)
        .map(([month, rows]) => ({ month, rows }))
        .sort((a, b) => (a.month < b.month ? 1 : -1)),
    ]),
  );
}

export async function getNews(limit = 400): Promise<NewsItem[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("news").find({}).sort({ published: -1 }).limit(limit).toArray();
    return docs.map((d) => ({
      id: String(d._id),
      chem: d.chem,
      title: d.title,
      source: d.source,
      link: d.link,
      published: new Date(d.published).toISOString(),
      ...(d.kind ? { kind: d.kind, category: d.category } : {}),
    }));
  }
  return (await readJson<NewsItem[]>("news.json", [])).slice(0, limit);
}

export async function getQuotes(chem?: string): Promise<Quote[]> {
  "use cache";
  cacheLife("market");
  cacheTag("quotes");
  if (!hasMongo()) return [];
  const db = await getDb();
  const docs = await db
    .collection("quotes")
    .find(chem ? { chem } : {})
    .sort({ date: -1, createdAt: -1 })
    .limit(500)
    .toArray();
  return docs.map(({ _id, createdAt, ...rest }) => ({
    ...(rest as Omit<Quote, "id" | "createdAt">),
    id: String(_id),
    createdAt: new Date(createdAt).toISOString(),
  }));
}

export async function storageMode(): Promise<"mongo" | "json"> {
  return hasMongo() ? "mongo" : "json";
}

// ----------------------------------------------------------------------------- sellers

export type RawListing = {
  id: string;
  src: "indiamart" | "tradeindia" | "exportersindia";
  via?: "brief"; // the price came from an imported brief (originally IndiaMART data)
  briefNote?: string;
  briefPrice?: string;
  briefDate?: string;
  product: string;
  chem: string | null;
  category: string;
  title: string;
  company: string;
  companyKey: string;
  city: string;
  state: string;
  price: number | null;
  unit: string | null;
  priceKg: number | null;
  priceText: string;
  pack: string;
  grade: string;
  flags: string[];
  memberYears: number | null;
  gstVerified: boolean;
  rating: number | null;
  ratings: number | null;
  types: Record<string, boolean>;
  url: string;
  note?: string;
  briefId?: string;
  firstSeen: string;
  lastSeen: string;
  changedAt: string;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : "");

function toListing(id: string, d: Record<string, unknown>): RawListing {
  return {
    id,
    src: d.src as RawListing["src"],
    product: String(d.product ?? ""),
    chem: (d.chem as string) ?? null,
    category: String(d.category ?? ""),
    title: String(d.title ?? ""),
    company: String(d.company ?? ""),
    companyKey: String(d.companyKey ?? ""),
    city: String(d.city ?? ""),
    state: String(d.state ?? ""),
    price: (d.price as number) ?? null,
    unit: (d.unit as string) ?? null,
    priceKg: (d.priceKg as number) ?? null,
    priceText: String(d.priceText ?? ""),
    pack: String(d.pack ?? ""),
    grade: String(d.grade ?? ""),
    flags: (d.flags as string[]) ?? [],
    memberYears: (d.memberYears as number) ?? null,
    gstVerified: Boolean(d.gstVerified),
    rating: (d.rating as number) ?? null,
    ratings: (d.ratings as number) ?? null,
    types: (d.types as Record<string, boolean>) ?? {},
    url: String(d.url ?? ""),
    note: d.note ? String(d.note) : undefined,
    via: d.via === "brief" ? "brief" : undefined,
    briefNote: d.briefNote ? String(d.briefNote) : undefined,
    briefPrice: d.briefPrice ? String(d.briefPrice) : undefined,
    briefDate: d.briefDate ? String(d.briefDate) : undefined,
    briefId: d.briefId ? String(d.briefId) : undefined,
    firstSeen: iso(d.firstSeen),
    lastSeen: iso(d.lastSeen),
    changedAt: iso(d.changedAt),
  };
}

export async function getListings(): Promise<RawListing[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("listings").find({}).toArray();
    return docs.map(({ _id, ...d }) => toListing(String(_id), d));
  }
  const raw = await readJson<Record<string, Record<string, unknown>>>("sellers/listings.json", {});
  return Object.entries(raw).map(([id, d]) => toListing(id, d));
}

export type ListingPrice = { l: string; d: string; price: number | null; unit: string | null; priceKg: number | null; product?: string };

export async function getListingPrices(): Promise<ListingPrice[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("listing_prices").find({}, { projection: { _id: 0 } }).sort({ d: 1 }).toArray();
    return docs as unknown as ListingPrice[];
  }
  return readJson<ListingPrice[]>("sellers/listing_prices.json", []);
}

export type BriefDoc = { id: string; date: string; title: string; text: string; rows: number; matched: number; importedAt: string };

export async function getBriefs(): Promise<BriefDoc[]> {
  "use cache";
  cacheLife("market");
  cacheTag("market", "sellers");
  if (hasMongo()) {
    const db = await getDb();
    const docs = await db.collection("briefs").find({}).sort({ date: -1 }).toArray();
    return docs.map(({ _id, importedAt, ...d }) => ({ ...(d as unknown as Omit<BriefDoc, "id" | "importedAt">), id: String(_id), importedAt: iso(importedAt) }));
  }
  return readJson<BriefDoc[]>("briefs.json", []);
}
