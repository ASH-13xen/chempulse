"use client";

import { ArrowLeft, CheckCircle2, ClipboardPaste, Eye, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BriefRow } from "@/lib/brief-parser";
import { fmtDate, fmtNum } from "@/lib/format";
import type { BriefDoc } from "@/lib/repo";
import { Card } from "../ui/card";
import { Reveal } from "../ui/motion";

type Preview = { date: string; title: string; rows: BriefRow[]; skipped: string[] };

export function BriefImportView({ briefs, storage }: { briefs: BriefDoc[]; storage: "mongo" | "json" }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [source, setSource] = useState<"indiamart" | "tradeindia">("indiamart");

  async function call(save: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, save, date: preview?.date, source }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? "Something went wrong." });
    if (!save) return setPreview(body as Preview);
    setMsg({ ok: true, text: `Saved ${body.rows} rows from the ${fmtDate(body.date, "long")} brief under ${body.source === "tradeindia" ? "TradeIndia" : "IndiaMART"}: ${body.merged} added to existing sellers' price history, ${body.created} new listings, ${body.changed} price changes, ${body.unchanged} unchanged.` });
    router.refresh();
  }

  const matched = preview?.rows.filter((r) => r.matched).length ?? 0;
  return (
    <Reveal className="mx-auto max-w-[1200px] space-y-6">
      <div data-reveal>
        <Link href="/brief" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Daily brief
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Import a market brief</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Paste a brief (or any price list laid out as Company · Product · Price under “Chennai” / “Mumbai” headings). Every seller row is matched to a product, converted to ₹/kg and filed under the marketplace the brief took its prices from. If that seller already has a listing for the product in the same city, the brief price joins its price history; otherwise a new listing is created and marked “via brief”. Nothing is overwritten with an older price.
        </p>
      </div>

      <Card title="Paste the brief" png={false}>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          placeholder={"Chemicals Market Brief: Chennai & Mumbai\n21 Nov 2026 (IST) | …\n\n1. Solvents\nChennai (source: …)\nCompany\tProduct\tPrice\nShri Ram Chemicals, Chennai\tToluene 100%\tRs 92/kg"}
          className="input h-64 py-3 font-mono text-[12px] leading-relaxed"
          aria-label="Brief text"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Prices came from
            <select value={source} onChange={(e) => setSource(e.target.value as "indiamart" | "tradeindia")} className="input h-9 w-auto">
              <option value="indiamart">IndiaMART</option>
              <option value="tradeindia">TradeIndia</option>
            </select>
          </label>
          <button type="button" className="btn" disabled={busy || text.trim().length < 40} onClick={() => call(false)}>
            <Eye className="size-4" /> Preview
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !preview || storage !== "mongo"} onClick={() => call(true)}>
            <Save className="size-4" /> Save {preview ? `${preview.rows.length} rows` : ""}
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                setText(await navigator.clipboard.readText());
                setPreview(null);
              } catch {
                setMsg({ ok: false, text: "Clipboard access was blocked; paste with Ctrl+V instead." });
              }
            }}
          >
            <ClipboardPaste className="size-4" /> Paste from clipboard
          </button>
          {storage !== "mongo" && <span className="text-[13px] text-ink-2">Saving needs MongoDB.</span>}
          {msg && (
            <span className={`inline-flex items-center gap-1.5 text-[13px] ${msg.ok ? "text-up-ink" : "text-down-ink"}`}>
              {msg.ok && <CheckCircle2 className="size-4" />} {msg.text}
            </span>
          )}
        </div>
      </Card>

      {preview && (
        <Card title={`Preview: ${preview.rows.length} seller rows found`} subtitle={`${preview.title} · dated ${fmtDate(preview.date, "long")} · ${matched} matched to a product, ${preview.rows.length - matched} filed under “Other …”`} png={false}>
          <div className="max-h-[560px] overflow-auto">
            <table className="tnum w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 text-left font-medium">City</th>
                  <th className="py-2 pr-3 text-left font-medium">Company</th>
                  <th className="py-2 pr-3 text-left font-medium">Listing</th>
                  <th className="py-2 pr-3 text-left font-medium">Matched product</th>
                  <th className="py-2 pr-3 text-right font-medium">Price</th>
                  <th className="py-2 pr-3 text-right font-medium">₹/kg</th>
                  <th className="py-2 text-left font-medium">Flags / notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-1.5 pr-3 text-ink-2">{r.city}</td>
                    <td className="py-1.5 pr-3 font-medium text-ink">{r.company}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{r.title}</td>
                    <td className={`py-1.5 pr-3 ${r.matched ? "text-ink" : "text-muted"}`}>{r.productName}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap text-ink-2">{r.priceText}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap text-ink">{r.priceKg != null ? `₹${fmtNum(r.priceKg)}` : "–"}</td>
                    <td className="py-1.5 text-[12px] text-ink-2">
                      {r.flags.join(", ")}
                      {r.note && <div className="text-muted">{r.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.skipped.length > 0 && <p className="mt-2 text-xs text-muted">{preview.skipped.length} table lines had no recognisable price and were skipped.</p>}
        </Card>
      )}

      <Card title="Briefs already imported" png={false}>
        {briefs.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {briefs.map((b) => (
              <li key={b.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">{b.title}</span>
                    <span className="text-[13px] text-ink-2">
                      {fmtDate(b.date, "long")} · {b.rows} rows · imported {fmtDate(b.importedAt.slice(0, 10))}
                    </span>
                  </summary>
                  <pre className="mt-2 max-h-[420px] overflow-auto rounded-lg bg-surface-2 p-3 text-[12px] whitespace-pre-wrap text-ink-2">{b.text}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No briefs imported yet.</p>
        )}
      </Card>
    </Reveal>
  );
}
