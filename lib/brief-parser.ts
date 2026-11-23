/**
 * Turns a pasted market brief (like the "Chemicals Market Brief: Chennai & Mumbai")
 * into seller rows. Works on the brief's tables:
 *
 *   Chennai (source: IndiaMART thinners, 21 Nov 2026; toluene, 19 Oct 2026)
 *   Company<TAB>Product<TAB>Price
 *   Shri Ram Chemicals, Chennai<TAB>Toluene 100%<TAB>Rs 92/kg
 *
 * Section headings ("1. Solvents", "4. Agrochemicals") give the category, so a row
 * that matches no known product still lands in "Other <category> products".
 * Tab-separated rows are expected (that is what copying from a document gives);
 * rows split by 2+ spaces also work.
 */
import { categories, chemicalById } from "./catalog";
import { matchProduct, productById, type Product } from "./products";

export type BriefRow = {
  section: string;
  category: string;
  city: string;
  company: string;
  title: string;
  priceText: string;
  price: number | null;
  unit: "kg" | "L" | "t" | null;
  priceKg: number | null;
  note: string;
  flags: string[];
  product: string;
  productName: string;
  matched: boolean;
  pageDate: string | null;
};

export type ParsedBrief = { date: string | null; title: string; rows: BriefRow[]; skipped: string[] };

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

function parseDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  return m ? `${m[3]}-${MONTHS[m[2].slice(0, 3).toLowerCase()]}-${m[1].padStart(2, "0")}` : null;
}

const CATEGORY_WORDS: [RegExp, string][] = [
  [/solvent/i, "solvents"],
  [/polymer|resin|plastic/i, "polymers"],
  [/agro|pesticid|insecticid|herbicid/i, "agro"],
  [/water/i, "water"],
  [/food|feed/i, "food-feed"],
  [/life science|body care|pharma|cosmetic/i, "life-science"],
  [/specialty|speciality|surfactant/i, "specialty"],
  [/building block|petrochem|intermediate/i, "building-blocks"],
];

function categoryFromHeading(line: string): string | null {
  for (const [re, id] of CATEGORY_WORDS) if (re.test(line)) return id;
  return null;
}

function splitCells(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
  return cells.map((c) => c.trim()).filter(Boolean);
}

function densityFor(p: Product | null) {
  if (!p) return null;
  return p.density ?? (p.chem ? (chemicalById[p.chem]?.density ?? null) : null);
}

export function parseBrief(text: string): ParsedBrief {
  const lines = text.replace(/\r/g, "").split("\n");
  const title = lines.find((l) => l.trim())?.trim() ?? "Market brief";
  const date = parseDate(lines.slice(0, 4).join(" "));
  const rows: BriefRow[] = [];
  const skipped: string[] = [];
  let category = "solvents";
  let section = "";
  let city = "";
  let pageDate: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^\d+\.\s+(.+)$/);
    if (heading && !line.includes("\t")) {
      const c = categoryFromHeading(heading[1]);
      if (c) {
        category = c;
        section = heading[1];
      }
      continue;
    }
    const cityLine = line.match(/^(Chennai|Mumbai|Delhi|Kolkata|Ahmedabad|Bengaluru|Hyderabad|Pune|Vadodara|Surat)\b\s*(\(.*\))?\s*:?$/i);
    if (cityLine && !line.includes("\t")) {
      city = cityLine[1].replace(/^\w/, (c) => c.toUpperCase());
      pageDate = parseDate(cityLine[2] ?? "") ?? date;
      continue;
    }
    const cells = splitCells(line);
    if (cells.length < 3 || /^company$/i.test(cells[0])) continue;
    const priceCell = cells[cells.length - 1];
    if (!/(rs\.?|₹|inr)\s*[\d,]/i.test(priceCell)) {
      if (cells.length >= 3) skipped.push(line);
      continue;
    }
    const companyCell = cells[0];
    const title = cells.slice(1, -1).join(" ");
    // "Gopi Paints, Chennai (says it is a manufacturer/exporter)" → company, own city, notes
    const notes: string[] = [];
    let company = companyCell.replace(/\(([^)]*)\)/g, (_, n) => {
      notes.push(n);
      return "";
    });
    let ownCity = city;
    const parts = company.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      ownCity = parts[parts.length - 1];
      company = parts.slice(0, -1).join(", ");
    }
    const m = priceCell.match(/(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)\s*\/?\s*(kg|kgs|l|ltr|litre|liter|t|ton|tonne|mt)?/i);
    const price = m ? Number(m[1].replace(/,/g, "")) : null;
    const u = (m?.[2] ?? "").toLowerCase();
    const unit = u.startsWith("k") ? "kg" : u.startsWith("l") ? "L" : u.startsWith("t") || u === "mt" ? "t" : null;
    const priceNote = (priceCell.match(/\(([^)]*)\)/)?.[1] ?? "").trim();
    if (priceNote) notes.push(priceNote);
    const noteText = notes.join("; ");
    const flags: string[] = [];
    if (/deals in|trader|reselling/i.test(noteText)) flags.push("trader-likely");
    if (/manufacturer/i.test(noteText)) flags.push("manufacturer-claimed");
    if (/outlier|typo|unit error|placeholder|not comparable|check/i.test(noteText)) flags.push("outlier");
    if (/small.?pack|lab/i.test(noteText) || /\bLR\b|\bAR\b|lab grade/i.test(title)) flags.push("lab");
    if (/stale/i.test(noteText)) flags.push("stale");
    if (/reprocess/i.test(noteText)) flags.push("reprocessed");
    if (/\+\s*18%\s*gst|incl.*gst/i.test(title + noteText)) flags.push("gst-included");
    const product = matchProduct(title, category);
    const prod = product ?? productById[`other-${category}`];
    const density = densityFor(product);
    const priceKg = price == null ? null : unit === "kg" ? price : unit === "t" ? price / 1000 : unit === "L" && density ? price / density : null;
    if (unit === "L" && !density) flags.push("per-litre");
    rows.push({
      section,
      category: prod.category,
      city: ownCity || city || "Unknown",
      company: company.trim(),
      title,
      priceText: priceCell.replace(/\s*\(.*\)\s*$/, ""),
      price,
      unit,
      priceKg: priceKg == null ? null : Math.round(priceKg * 100) / 100,
      note: noteText,
      flags,
      product: prod.id,
      productName: prod.name,
      matched: Boolean(product),
      pageDate,
    });
  }
  return { date, title, rows, skipped };
}

export const BRIEF_CATEGORIES = categories.map((c) => c.id);
