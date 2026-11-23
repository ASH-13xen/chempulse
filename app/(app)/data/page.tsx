import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Ago } from "@/components/ui/ago";
import { CategoryDot } from "@/components/ui/change";
import { getBoard } from "@/lib/board";
import { categoryById, chemicals, importSeriesId, marketById } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";
import { getNews, getOrigins, getRuns, getSeriesStatus } from "@/lib/repo";

export const metadata: Metadata = { title: "Data & methods" };

const SOURCES = [
  { id: "futures", name: "China futures exchanges", what: "Daily open/high/low/close for 15 contracts (PP, LLDPE, PVC, MEG, styrene, benzene, LPG, PTA, methanol, caustic soda, soda ash, paraxylene, propylene, urea, aluminium).", how: "Read every 3 hours with the free AkShare library (exchange quotes via Sina Finance). During Chinese trading hours today's bar updates.", link: "https://akshare.akfamily.xyz/" },
  { id: "fred", name: "FRED / US EIA", what: "Brent and WTI crude, Henry Hub natural gas, Mont Belvieu propane.", how: "Public CSV download every 3 hours. FRED posts these a few days after the trading date.", link: "https://fred.stlouisfed.org/" },
  { id: "fx", name: "European Central Bank (Frankfurter)", what: "Rupees per US dollar and per Chinese yuan.", how: "Free API, every 3 hours. ECB publishes once per working day.", link: "https://frankfurter.dev/" },
  { id: "tradestat", name: "Tradestat, Department of Commerce", what: "India's monthly imports by HS code: quantity, value and origin country.", how: "Checked once a day; only new months are downloaded. The government publishes about 6–8 weeks after month-end and revises recent months.", link: "https://tradestat.commerce.gov.in/" },
  { id: "indiamart", name: "IndiaMART (seller listings)", what: "Sellers, cities and asking prices for 46 products, national and city pages.", how: "Read slowly (one page every 10–16 s, 40 pages per run) because IndiaMART limits fast visitors; a full pass takes about three days. Pauses for 6 hours if the site pushes back. Only public pages allowed by robots.txt.", link: "https://dir.indiamart.com/" },
  { id: "tradeindia", name: "TradeIndia (seller listings)", what: "Sellers with manufacturer/trader flags, cities and prices for the same products.", how: "National and city pages, re-read about once a day within a 10-minute budget per run.", link: "https://www.tradeindia.com/" },
  { id: "exportersindia", name: "ExportersIndia (seller listings)", what: "Sellers with GST / trust badges, years listed, ratings and price ranges for the same products.", how: "National and city pages, one every 3–5 s, up to 150 pages per run; a page is re-read about once a day. Price ranges use the midpoint.", link: "https://www.exportersindia.com/" },
  { id: "news", name: "Google News (India)", what: "Headlines naming a tracked chemical with a price, plant, supply or trade word, plus regulatory alerts (DGTR, anti-dumping, BIS, CBIC, FSSAI, CDSCO, CIB&RC).", how: "Read every 6 hours; headline, source, date and link only.", link: "https://news.google.com/" },
];

const CHECK_LABEL: Record<string, string> = {
  "futures-ohlc": "China futures bars consistent:",
  "futures-jumps": "No suspicious futures jumps:",
  "fx-usd-crosscheck": "USD/INR matches the US Fed:",
  "fx-cny-crosscheck": "CNY/INR matches the US Fed:",
  "fx-crosscheck": "Exchange-rate cross-check:",
  "energy-ranges": "Energy prices in normal ranges:",
  "import-vs-china": "India import prices agree with China prices:",
  "imports-total": "Import totals add up:",
  freshness: "All sources current:",
};

const GLOSSARY: [string, string][] = [
  ["China futures (continuous contract)", "The price of the most-traded contract on each exchange, joined into one line. When the exchange's most-traded contract switches (usually a few times a year), the line can show a small jump that is a contract change, not a market move."],
  ["Daily vs monthly chemicals", "Daily chemicals have a China futures contract that trades every day. Monthly chemicals have no free daily price, so they use India's average import price, which updates once a month."],
  ["Import price (₹/kg)", "Customs value ÷ quantity for all of India's imports under the chemical's HS code that month. It is what importers actually paid (CIF, before duty), averaged across grades and pack sizes. Months where volume is under 25% of normal, or under 5 tonnes, are hidden because a few small shipments distort the average."],
  ["≈ ₹/kg for China prices", "China futures (¥ per tonne) × that day's yuan-to-rupee rate ÷ 1,000. Includes China's 13% VAT; excludes freight, insurance and Indian duty. Use it to compare direction and rough level, not as a landed cost."],
  ["Change (1D, 1W, 1M…)", "Latest value vs the value at or just before that many days/months ago. For monthly data, vs the same calendar month."],
  ["Trend", "Up when the short-term average (20 trading days, or 3 months for monthly data) is above the long-term average (50 trading days, or 12 months) and the price is above the long average. Down is the mirror image. Otherwise sideways."],
  ["Trend strength", "1-month change (3-month for monthly data) divided by the chemical's own typical move scaled to that period. +1 means a rise about as big as a normal month's swing; above +2 is unusually strong. It lets a calm chemical and a volatile one be ranked fairly."],
  ["Typical move", "Standard deviation of daily % changes over the last 90 trading days (or monthly changes over 24 months). About two thirds of days move less than this."],
  ["Unusual move", "A day whose change is at least 2.5× the typical daily move (2× for monthly data)."],
  ["52-week range", "Lowest and highest closing price in the last 52 weeks (12 months for monthly data); the dot shows where today sits."],
  ["Rebased to 100", "Every series is divided by its own value on the start date and multiplied by 100, so different units can share one chart without a second axis."],
  ["Correlation", "How closely two series move together, using weekly % changes (monthly when an import series is involved) over the last 3 years. 1 = always together, 0 = unrelated, −1 = opposite. Correlation is not causation."],
  ["Seasonal pattern", "Average % change for each calendar month across all years of data. Patterns can break, so treat it as a hint."],
  ["Seller asking price", "The price a seller advertises on IndiaMART / TradeIndia or that appears in an imported brief, converted to ₹/kg (litres via density, drums and bags via the stated pack size). It is not a deal price and GST is usually not stated. Lab packs, packs of 5 kg/L or less, and prices over 3× or under ⅓ of the product's median are kept but left out of medians."],
  ["Trading region", "Towns grouped into the market a buyer would treat as one: e.g. Thane, Navi Mumbai and Bhiwandi count as Mumbai; Kanchipuram and Tiruvallur as Chennai."],
  ["Noisy / Group", "Noisy: India imports only small or irregular volumes, so the monthly import price jumps around (typical monthly move above 30%). Group: the customs code covers several products (e.g. 'other chlorides' for ferric chloride). Both are shown but kept out of rankings and signals."],
];

export default async function DataPage() {
  const [board, status, runs, origins, news] = await Promise.all([getBoard(), getSeriesStatus(), getRuns(40), getOrigins(), getNews(600)]);
  const newsCount = news.reduce<Record<string, number>>((a, n) => ((a[n.chem] = (a[n.chem] ?? 0) + 1), a), {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Data & methods</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Where every number comes from, how fresh it is, and exactly how it is calculated. All sources are free and public. The collector runs every 3 hours and saves a price only when it is new or has changed.
          Storage: <b className="text-ink">{board.storage === "mongo" ? "MongoDB Atlas" : "local snapshot files"}</b>.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SOURCES.map((s) => {
          const run = board.sources[s.id];
          return (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-ink">{s.name}</div>
                {run ? (
                  run.ok ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-up-ink">
                      <CheckCircle2 className="size-4" /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-down-ink">
                      <CircleAlert className="size-4" /> Failed
                    </span>
                  )
                ) : (
                  <span className="text-xs text-muted">Not run yet</span>
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-2">{s.what}</p>
              <p className="mt-2 text-[13px] text-muted">{s.how}</p>
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Last run</dt>
                  <dd className="text-ink">
                    <Ago iso={run?.at} />
                  </dd>
                </div>
                {run && (
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Result</dt>
                    <dd className="text-ink">{run.ok ? `${run.new ?? 0} new · ${run.updated ?? 0} changed · ${run.unchanged ?? 0} unchanged` : run.error?.slice(0, 80)}</dd>
                  </div>
                )}
              </dl>
              <a href={s.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
                Source <ExternalLink className="size-3" />
              </a>
            </div>
          );
        })}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Data checks</h2>
          <span className="text-xs text-muted">
            Run after every collection · last run <Ago iso={board.sources.checks?.at} />
          </span>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">Automatic consistency and cross-source checks. A warning does not stop collection; it tells you which number to double-check.</p>
        {board.sources.checks?.checks?.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {board.sources.checks.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-up-ink" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--serious)]" />}
                <span>
                  <b className="font-medium text-ink">{CHECK_LABEL[c.name] ?? c.name}</b> <span className="text-ink-2">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-ink-2">Checks have not run yet; they run at the end of the next collection.</p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold text-ink">Coverage by chemical</h2>
          <p className="text-[13px] text-ink-2">What data each chemical has today.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="tnum w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-y border-line">
                <th className="px-5 py-2 text-left font-medium">Chemical</th>
                <th className="px-3 py-2 text-left font-medium">Daily signal</th>
                <th className="px-3 py-2 text-left font-medium">Daily history</th>
                <th className="px-3 py-2 text-left font-medium">India imports (HS)</th>
                <th className="px-3 py-2 text-left font-medium">Origins</th>
                <th className="px-3 py-2 text-right font-medium">News (30 d)</th>
                <th className="px-5 py-2 text-left font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {chemicals.map((c) => {
                const d = c.daily ? status[c.daily] : null;
                const imp = status[importSeriesId(c.id)];
                const row = board.rows.find((r) => r.id === c.id)!;
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="px-5 py-2">
                      <Link href={`/chemical/${c.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:text-accent-ink">
                        <CategoryDot slot={categoryById[c.category].slot} /> {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{c.daily ? `${marketById[c.daily].name} (${marketById[c.daily].exchange.split(" ")[0]})` : "—"}</td>
                    <td className="px-3 py-2 text-ink-2">{d ? `${fmtDate(d.firstDate, "month")} → ${fmtDate(d.lastDate)}` : "—"}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {imp ? `${fmtDate(imp.firstDate, "month")} → ${fmtDate(imp.lastDate, "month")}` : "—"} <span className="text-muted">({c.hs.join(", ")})</span>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{origins[c.id]?.[0] ? fmtDate(origins[c.id][0].month + "-01", "month") : "—"}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{newsCount[c.id] ?? 0}</td>
                    <td className="px-5 py-2 text-xs text-ink-2">{c.group ? "Broad customs group" : row.noisy ? "Noisy import price" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-[15px] font-semibold text-ink">How the numbers are made</h2>
          <dl className="mt-3 divide-y divide-[var(--line)]">
            {GLOSSARY.map(([t, d]) => (
              <div key={t} className="py-3">
                <dt className="text-sm font-medium text-ink">{t}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-[15px] font-semibold text-ink">What this data can and cannot tell you</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
              <li>• It is built for <b className="text-ink">spotting trends</b>: direction, speed, turning points and unusual moves. It is not a quote for any city or supplier.</li>
              <li>• China futures lead Indian prices for many petrochemicals, but freight, duties, the rupee and local supply can make India move later or differently.</li>
              <li>• Import prices are averages across grades and sellers and arrive 6–8 weeks after month-end.</li>
              <li>• No free source offers buyer names or Chennai/Mumbai daily prices. Your own supplier quotes (on each chemical page) fill that gap over time.</li>
              <li>• Free sources can change or go offline. Each source&apos;s health is shown above, and one failing source never stops the others.</li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="text-[15px] font-semibold text-ink">Recent collector runs</h2>
            <div className="mt-3 max-h-[360px] overflow-auto">
              <table className="tnum w-full text-[13px]">
                <thead className="sticky top-0 bg-surface text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 text-left font-medium">When</th>
                    <th className="py-1.5 text-left font-medium">Source</th>
                    <th className="py-1.5 text-right font-medium">New</th>
                    <th className="py-1.5 text-right font-medium">Changed</th>
                    <th className="py-1.5 text-right font-medium">Same</th>
                    <th className="py-1.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-b border-line/60">
                      <td className="py-1.5 text-ink-2">
                        <Ago iso={r.at} />
                      </td>
                      <td className="py-1.5 text-ink">{r.source}</td>
                      <td className="py-1.5 text-right text-ink-2">{r.new ?? "–"}</td>
                      <td className="py-1.5 text-right text-ink-2">{r.updated ?? "–"}</td>
                      <td className="py-1.5 text-right text-ink-2">{r.unchanged ?? "–"}</td>
                      <td className={`py-1.5 text-right font-medium ${r.ok ? "text-up-ink" : "text-down-ink"}`} title={r.error}>
                        {r.ok ? "OK" : "Failed"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card p-5 text-[13px] text-ink-2">
            <h2 className="text-[15px] font-semibold text-ink">Credits</h2>
            <p className="mt-2">Charts by TradingView Lightweight Charts™ (Apache 2.0). Animations by GSAP. Market data from the sources listed above; trade data © Department of Commerce, Government of India (DGCI&S).</p>
          </div>
        </div>
      </section>
    </div>
  );
}
