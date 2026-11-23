import raw from "@/config/products.json";
import { categories } from "./catalog";

export type Product = {
  id: string;
  name: string;
  chem: string | null;
  category: string;
  density?: number;
  include: string[];
  exclude: string[];
  im: string[];
  ti: string[];
  virtual?: boolean;
};

const base = (raw.products as Product[]).map((p) => ({ ...p }));

/** Catch-all buckets for brief rows that match no specific product (e.g. "Animal feed additive"). */
const others: Product[] = categories.map((c) => ({
  id: `other-${c.id}`,
  name: `Other ${c.name.toLowerCase()} products`,
  chem: null,
  category: c.id,
  include: [],
  exclude: [],
  im: [],
  ti: [],
  virtual: true,
}));

export const products: Product[] = [...base, ...others];
export const productById = Object.fromEntries(products.map((p) => [p.id, p])) as Record<string, Product>;

export function productsForChem(chemId: string) {
  return base.filter((p) => p.chem === chemId);
}

const compiled = base.map((p) => ({
  p,
  inc: p.include.map((r) => new RegExp(r, "i")),
  exc: p.exclude.map((r) => new RegExp(r, "i")),
}));

/** First product whose include patterns match and exclude patterns don't. */
export function matchProduct(title: string, category?: string): Product | null {
  for (const { p, inc, exc } of compiled) {
    if (category && p.category !== category) continue;
    if (inc.some((r) => r.test(title)) && !exc.some((r) => r.test(title))) return p;
  }
  if (category) return matchProduct(title);
  return null;
}
