"use client";

import { AlertTriangle, ClipboardPaste, ExternalLink, FileDown, Gavel, Lightbulb, Newspaper, TrendingDown, TrendingUp, Minus } from "lucide-react";
import Link from "next/link";
import { categoryById } from "@/lib/catalog";
import type { DailyBrief } from "@/lib/daily-brief";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { BriefDoc } from "@/lib/repo";
import { useMoney } from "../providers/money";
import { CategoryDot } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";
import { sourceLabel } from "./seller-table";

export function DailyBriefView({ brief, briefs }: { brief: DailyBrief; briefs: BriefDoc[] }) {
  const money = useMoney();
  return (
    <Reveal className="mx-auto max-w-[1100px] space-y-6">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-accent-ink">Generated automatically from today&apos;s data</div>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink">Chemicals market brief</h1>
          <p className="mt-1 text-sm text-ink-2">
            As of {fmtDate(brief.asOf, "long")} · focus on Chennai &amp; Mumbai · prepared by ChemPulse
          </p>
        </div>
        <div className="flex gap-2" data-noprint>
          <Link href="/brief/import" className="btn">
            <ClipboardPaste className="size-4" /> Import a brief
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <FileDown className="size-4" /> Save as PDF
          </button>
        </div>
      </div>

      <section data-reveal className="card border-l-4 border-l-[var(--warn)] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="size-4 text-[var(--warn)]" /> Read first: data quality
        </h2>
        <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
          {brief.quality.map((q) => (
            <li key={q}>• {q}</li>
          ))}
        </ul>
      </section>

      <section data-reveal className="card p-5">
        <h2 className="text-lg font-semibold text-ink">Top 5 today</h2>
        <ol className="mt-3 space-y-3">
          {brief.top.map((t, i) => (
            <li key={t.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-surface">{i + 1}</span>
              <div>
                <div className="text-sm font-semibold text-ink">{t.title}</div>
                <p className="text-sm text-ink-2">
                  {t.text}{" "}
                  {t.href.startsWith("http") ? (
                    <a href={t.href} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">
                      source
                    </a>
                  ) : (
                    <Link href={t.href} className="text-accent-ink hover:underline" data-noprint>
                      details →
                    </Link>
                  )}
                </p>
              </div>
            </li>
          ))}
          {!brief.top.length && <li className="text-sm text-ink-2">Nothing stood out today.</li>}
        </ol>
      </section>

      {brief.sections.map((s, i) => (
        <section key={s.category} data-reveal className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <CategoryDot slot={categoryById[s.category].slot} />
            {i + 1}. {s.name}
          </h2>
          {s.lines.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
              {s.lines.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-2">No priced seller listings collected yet for this category.</p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {s.tables.map((t) => (
              <div key={t.region} className="overflow-hidden rounded-xl border border-line">
                <div className="bg-surface-2 px-3 py-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">{t.region}</div>
                {t.rows.length ? (
                  <table className="tnum w-full text-[13px]">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-line">
                        <th className="px-3 py-1.5 text-left font-medium">Company</th>
                        <th className="px-3 py-1.5 text-left font-medium">Product</th>
                        <th className="px-3 py-1.5 text-right font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((r) => (
                        <tr key={r.id} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-1.5 align-top">
                            <Link href={`/suppliers/${r.companyKey}`} className="font-medium text-ink hover:text-accent-ink">
                              {r.company}
                            </Link>
                            <div className="text-[11px] text-muted">{sourceLabel(r)}{r.flags.includes("trader-likely") ? " · likely trader" : ""}</div>
                          </td>
                          <td className="px-3 py-1.5 align-top text-ink-2">
                            <span className="line-clamp-2">{r.title}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right align-top whitespace-nowrap">
                            <div className="font-semibold text-ink">{r.priceKg != null ? `${money.kg(r.priceKg, 0)}/kg` : r.priceText}</div>
                            {(r.outlier || r.flags.includes("lab") || r.flags.includes("outlier")) && <div className="text-[11px] text-[var(--serious)]">{r.outlier ? "outlier" : r.flags.includes("lab") ? "lab / small pack" : "flagged"}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-3 py-4 text-[13px] text-ink-2">No public data found yet.</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                <Newspaper className="size-3.5" /> Market context
              </h3>
              <ul className="mt-1.5 space-y-1.5 text-[13px]">
                {s.context.map((n) => (
                  <li key={n.id}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent-ink">
                      {n.title}
                    </a>{" "}
                    <span className="text-muted">({n.source}, {fmtDate(n.published.slice(0, 10))})</span>
                  </li>
                ))}
                {!s.context.length && <li className="text-ink-2">No verified news in the last 30 days.</li>}
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                <Lightbulb className="size-3.5" /> Outlook (rule-based)
                <InfoTip title="How the outlook is made">
                  <p>Points are added for China futures trends and monthly moves, India import price changes, crude oil and the rupee. The balance decides firm / stable / soft. Confidence is “medium” only when several signals agree. It is a reading of the numbers, not advice.</p>
                </InfoTip>
              </h3>
              <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-ink">
                {s.outlook.direction === "firm" ? <TrendingUp className="mt-0.5 size-4 shrink-0 text-down-ink" /> : s.outlook.direction === "soft" ? <TrendingDown className="mt-0.5 size-4 shrink-0 text-up-ink" /> : <Minus className="mt-0.5 size-4 shrink-0 text-ink-2" />}
                <span>
                  {s.outlook.text} <span className="text-muted">Confidence: {s.outlook.confidence}.</span>
                </span>
              </p>
              {s.outlook.evidence.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                  {s.outlook.evidence.map((e) => (
                    <li key={e}>– {e}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[12px] text-muted">Would change on: {s.outlook.changeOn.join(", ")}.</p>
            </div>
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                <Gavel className="size-3.5" /> Regulatory / trade alerts
              </h3>
              <ul className="mt-1.5 space-y-1.5 text-[13px]">
                {s.regulatory.map((n) => (
                  <li key={n.id}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent-ink">
                      {n.title}
                    </a>{" "}
                    <span className="text-muted">({n.source}, {fmtDate(n.published.slice(0, 10))})</span>
                  </li>
                ))}
                {!s.regulatory.length && <li className="text-ink-2">None found in the last 30 days. Verify at dgtr.gov.in and cbic.gov.in.</li>}
              </ul>
            </div>
          </div>
        </section>
      ))}

      {brief.imports && (
        <section data-reveal className="card p-5">
          <h2 className="text-lg font-semibold text-ink">India import snapshot (government data)</h2>
          <p className="mt-2 text-sm text-ink-2">
            India&apos;s merchandise imports in {fmtDate(brief.imports.month, "month")}: ₹{fmtNum(brief.imports.crore, { digits: 0 })} crore
            {brief.imports.usdBn != null && ` (about $${brief.imports.usdBn.toFixed(1)} bn at the month's average rupee rate)`}
            {brief.imports.prevCrore != null && `, ${fmtPct((brief.imports.crore / brief.imports.prevCrore - 1) * 100)} vs the previous month`}
            {brief.imports.lyCrore != null && ` and ${fmtPct((brief.imports.crore / brief.imports.lyCrore - 1) * 100)} vs a year earlier`}. Source: Tradestat (DGCI&amp;S). Chemical-level detail is on the{" "}
            <Link href="/imports" className="text-accent-ink hover:underline">
              India imports
            </Link>{" "}
            page.
          </p>
        </section>
      )}

      <section data-reveal className="card p-5" data-noprint>
        <h2 className="text-sm font-semibold text-ink">Imported briefs</h2>
        {briefs.length ? (
          <ul className="mt-2 divide-y divide-[var(--line)] text-[13px]">
            {briefs.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink">{b.title}</span>
                <span className="text-ink-2">
                  {fmtDate(b.date, "long")} · {b.rows} seller rows ({b.matched} matched to products)
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-ink-2">None yet.</p>
        )}
        <Link href="/brief/import" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
          Paste a new brief <ExternalLink className="size-3" />
        </Link>
      </section>

      <p className="text-xs text-muted">
        Prices are indicative marketplace asking prices and must be verified with suppliers and your customs broker before any order or costing. Outlooks are rule-based readings of the data, not advice.
      </p>
    </Reveal>
  );
}
