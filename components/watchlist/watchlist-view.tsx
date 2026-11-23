"use client";

import { BadgeCheck, Download, FileDown, Plus, Star, Store, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { categoryById, hrefFor } from "@/lib/catalog";
import { downloadCsv } from "@/lib/download";
import { fmtDate, fmtPct } from "@/lib/format";
import { productById } from "@/lib/products";
import type { Row } from "@/lib/types";
import type { WatchSection, WatchView } from "@/lib/watchlist";
import { useMoney } from "../providers/money";
import { toggleWatchItem, useWatchlist, type WatchKind } from "../providers/watchlist";
import { CategoryDot, Change, FreqBadge, TrendBadge } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";
import { PriceText, RangeBar } from "../ui/row-bits";
import { Sparkline } from "../ui/sparkline";
import { SearchField } from "@/components/ui/search-field";

const KIND_LABEL: Record<WatchKind, string> = { chem: "Chemicals", market: "Markets", product: "Seller prices", supplier: "Suppliers" };

export function WatchlistView({ view }: { view: WatchView }) {
  const router = useRouter();
  const wl = useWatchlist();
  const [kind, setKind] = useState<"all" | WatchKind>("all");

  // Stars clicked elsewhere update the client list first; pull fresh server data when they differ.
  const serverKey = view.items.map((i) => `${i.t}:${i.id}`).sort().join("|");
  const clientKey = wl.items.map((i) => `${i.t}:${i.id}`).sort().join("|");
  useEffect(() => {
    if (wl.items.length || view.items.length) if (serverKey !== clientKey) router.refresh();
  }, [serverKey, clientKey, router, wl.items.length, view.items.length]);

  const remove = async (t: WatchKind, id: string) => {
    await toggleWatchItem(t, id);
    router.refresh();
  };

  const sections = view.sections
    .map((s) => ({
      ...s,
      chems: kind === "all" || kind === "chem" ? s.chems : [],
      markets: kind === "all" || kind === "market" ? s.markets : [],
      products: kind === "all" || kind === "product" ? s.products : [],
      suppliers: kind === "all" || kind === "supplier" ? s.suppliers : [],
    }))
    .filter((s) => s.chems.length + s.markets.length + s.products.length + s.suppliers.length > 0);

  const counts = { chem: wl.count("chem"), market: wl.count("market"), product: wl.count("product"), supplier: wl.count("supplier") };

  const exportCsv = () => {
    const rows: unknown[][] = [];
    for (const s of view.sections) {
      for (const r of [...s.chems, ...s.markets]) rows.push([s.name, r.type === "market" ? "Market" : "Chemical", r.name, r.last, r.unit, r.changes.d1?.toFixed(2), r.changes.w1?.toFixed(2), r.changes.m1?.toFixed(2), r.trend.dir, r.lastDate]);
      for (const p of s.products) rows.push([s.name, "Seller prices", p.name, p.stats.median?.toFixed(2), "Rs/kg (median ask)", "", "", "", `${p.companies} sellers`, ""]);
      for (const x of s.suppliers) for (const l of x.listings) rows.push([s.name, "Supplier", `${x.company.name}: ${productById[l.product]?.name ?? l.product}`, l.priceKg?.toFixed(2), "Rs/kg (asking)", "", "", "", l.city, l.lastSeen.slice(0, 10)]);
    }
    downloadCsv(`chempulse-watchlist-${new Date().toISOString().slice(0, 10)}.csv`, ["Category", "Kind", "Name", "Value", "Unit", "1D %", "1W %", "1M %", "Trend / note", "As of"], rows);
  };

  return (
    <Reveal className="space-y-6">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <Star className="size-6 fill-[var(--warn)] text-[var(--warn)]" /> My watchlist
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">Everything you chose to follow, in one place and grouped by category: chemicals and markets with today&apos;s moves, seller prices by city, and the suppliers you are tracking. Add from the box below or tap ☆ anywhere on the site.</p>
        </div>
        <div className="flex gap-2" data-noprint>
          <button type="button" className="btn" onClick={exportCsv} disabled={!view.items.length}>
            <Download className="size-4" /> CSV
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            <FileDown className="size-4" /> PDF
          </button>
        </div>
      </div>

      {view.storage !== "mongo" && <div className="card p-4 text-sm text-ink-2">The watchlist page needs the MongoDB database (set MONGODB_URI). Stars still work in this browser.</div>}

      <div data-reveal className="card space-y-3 p-4" data-noprint>
        <AddBox view={view} onAdded={() => router.refresh()} />
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="chip" data-on={kind === "all"} onClick={() => setKind("all")}>
            All ({wl.count()})
          </button>
          {(Object.keys(KIND_LABEL) as WatchKind[]).map((k) => (
            <button key={k} type="button" className="chip" data-on={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      {!view.items.length && (
        <div data-reveal className="card flex flex-col items-center px-6 py-14 text-center">
          <Star className="size-10 text-[var(--warn)]" />
          <h2 className="mt-3 text-lg font-semibold text-ink">Your watchlist is empty</h2>
          <p className="mt-1 max-w-md text-sm text-ink-2">Search above for a chemical (e.g. toluene), a seller product (e.g. PAC), a market (e.g. Brent) or a supplier, and add it. Or tap the ☆ on any card, chemical page, product page or supplier.</p>
        </div>
      )}

      {sections.map((s) => (
        <Section key={s.id} s={s} medians={view.medians} onRemove={remove} />
      ))}

      {view.missing.length > 0 && (kind === "all" || view.missing.some((m) => m.t === kind)) && (
        <div className="card p-4 text-[0.8125rem] text-ink-2">
          <b className="text-ink">Saved but no current data:</b>{" "}
          {view.missing.map((m) => (
            <span key={`${m.t}:${m.id}`} className="mr-2 inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5">
              {KIND_LABEL[m.t]}: {m.id}
              <button type="button" aria-label="Remove" onClick={() => remove(m.t, m.id)} className="text-muted hover:text-down-ink">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <span className="text-muted">(e.g. a supplier not seen in the last 30 days)</span>
        </div>
      )}
    </Reveal>
  );
}

function Section({ s, medians, onRemove }: { s: WatchSection; medians: Record<string, number | null>; onRemove: (t: WatchKind, id: string) => void }) {
  const money = useMoney();
  const n = s.chems.length + s.markets.length + s.products.length + s.suppliers.length;
  return (
    <section data-reveal className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
        {s.slot ? <CategoryDot slot={s.slot} /> : <span className="size-2.5 rounded-sm bg-[var(--muted)]" />}
        {s.name}
        <span className="text-sm font-normal text-muted">({n})</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {[...s.chems, ...s.markets].map((r) => (
          <RowCard key={r.id} r={r} onRemove={() => onRemove(r.type === "market" ? "market" : "chem", r.id)} />
        ))}
        {s.products.map((p) => {
          const reg = (name: string) => p.regions.find((x) => x.region === name)?.stats;
          const ch = reg("Chennai");
          const mu = reg("Mumbai");
          return (
            <div key={p.id} className="card card-hover relative p-4">
              <RemoveBtn onClick={() => onRemove("product", p.id)} name={p.name} />
              <Link href={`/products/${p.id}`} className="block">
                <div className="flex items-center gap-2 text-xs font-medium text-accent-ink">
                  <Store className="size-3.5" /> Seller prices
                </div>
                <div className="mt-0.5 pr-8 font-semibold text-ink hover:text-accent-ink">{p.name}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["All India", p.stats.median, p.stats.credible],
                    ["Chennai", ch?.median ?? null, ch?.credible ?? 0],
                    ["Mumbai", mu?.median ?? null, mu?.credible ?? 0],
                  ].map(([label, v, cnt]) => (
                    <div key={label as string} className="rounded-lg bg-surface-2 px-2 py-2">
                      <div className="text-[0.6875rem] text-muted">{label as string}</div>
                      <div className="tnum text-base font-semibold text-ink">{v != null ? money.kg(v as number, 0) : "–"}</div>
                      <div className="text-[0.625rem] text-muted">{cnt as number} sellers</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-2">
                  <span>{p.companies} sellers in all</span>
                  <span>{p.markup != null ? `${fmtPct(p.markup, 0)} vs import price` : ""}</span>
                </div>
              </Link>
            </div>
          );
        })}
        {s.suppliers.map(({ company: c, listings }) => (
          <div key={c.key} className="card card-hover relative p-4">
            <RemoveBtn onClick={() => onRemove("supplier", c.key)} name={c.name} />
            <Link href={`/suppliers/${c.key}`} className="flex items-center gap-1.5 pr-8 font-semibold text-ink hover:text-accent-ink">
              {c.name}
              {c.gstVerified && <BadgeCheck className="size-3.5 text-accent-ink" />}
            </Link>
            <div className="mt-0.5 text-xs text-ink-2">
              {c.regions.join(", ")} · {[c.types.manufacturer && "Manufacturer", (c.types.trader || c.types.distributor) && "Trader", c.types.exporter && "Exporter"].filter(Boolean).join(" · ") || "type not stated"}
              {c.rating ? ` · ★ ${c.rating.toFixed(1)}` : ""}
            </div>
            <table className="tnum mt-3 w-full text-[0.8125rem]">
              <tbody>
                {listings.slice(0, 6).map((l) => {
                  const m = medians[l.product];
                  const vs = m && l.priceKg && l.credible ? (l.priceKg / m - 1) * 100 : null;
                  return (
                    <tr key={l.id} className="border-t border-line/60">
                      <td className="py-1.5 pr-2 text-ink-2">
                        <span className="line-clamp-1">{productById[l.product]?.name ?? l.product}</span>
                        <span className="text-[0.6875rem] text-muted">{l.city}</span>
                      </td>
                      <td className="py-1.5 text-right font-semibold whitespace-nowrap text-ink">{l.priceKg != null ? `${money.kg(l.priceKg, 0)}/kg` : "on request"}</td>
                      <td className={`py-1.5 pl-2 text-right text-xs whitespace-nowrap ${vs == null ? "text-muted" : vs > 0 ? "text-down-ink" : "text-up-ink"}`}>{vs == null ? "" : fmtPct(vs, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {listings.length > 6 && <div className="mt-1 text-xs text-muted">+{listings.length - 6} more listings</div>}
            <div className="mt-2 text-[0.6875rem] text-muted">Last seen {fmtDate(c.lastSeen.slice(0, 10))}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RowCard({ r, onRemove }: { r: Row; onRemove: () => void }) {
  return (
    <div className="card card-hover relative p-4">
      <RemoveBtn onClick={onRemove} name={r.name} />
      <Link href={hrefFor(r.id)} className="block">
        <div className="flex items-center gap-2 pr-8">
          <span className="truncate font-semibold text-ink hover:text-accent-ink">{r.name}</span>
          <FreqBadge frequency={r.frequency} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <PriceText row={r} className="block text-xl font-semibold text-ink" />
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {r.frequency === "daily" && (
                <span className="flex items-center gap-1 text-muted">
                  1D <Change value={r.changes.d1} size="xs" />
                </span>
              )}
              {r.frequency === "daily" && (
                <span className="flex items-center gap-1 text-muted">
                  1W <Change value={r.changes.w1} size="xs" />
                </span>
              )}
              <span className="flex items-center gap-1 text-muted">
                1M <Change value={r.changes.m1} size="xs" />
              </span>
            </div>
          </div>
          <Sparkline values={r.spark} width={110} height={40} animate={false} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <TrendBadge dir={r.trend.dir} />
          <div className="flex-1">
            <RangeBar pos={r.rangePos} lo={r.lo52} hi={r.hi52} unit={r.unit} compact />
          </div>
          <span className="text-[0.6875rem] text-muted">{r.frequency === "monthly" ? fmtDate(r.lastDate, "month") : fmtDate(r.lastDate)}</span>
        </div>
      </Link>
    </div>
  );
}

function RemoveBtn({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <button type="button" data-noprint title="Remove from watchlist" aria-label={`Remove ${name} from watchlist`} onClick={onClick} className="absolute top-3 right-3 z-10 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-down-ink">
      <X className="size-4" />
    </button>
  );
}

type Option = { t: WatchKind; id: string; label: string; hint: string; slot?: number };

function AddBox({ view, onAdded }: { view: WatchView; onAdded: () => void }) {
  const wl = useWatchlist();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const all = useMemo<Option[]>(
    () => [
      ...view.pickers.chems.map((c) => ({ t: "chem" as const, id: c.id, label: c.name, hint: `Chemical · ${categoryById[c.category]?.name}`, slot: categoryById[c.category]?.slot })),
      ...view.pickers.products.map((p) => ({ t: "product" as const, id: p.id, label: `${p.name}: seller prices`, hint: `Seller prices · ${categoryById[p.category]?.name}`, slot: categoryById[p.category]?.slot })),
      ...view.pickers.markets.map((m) => ({ t: "market" as const, id: m.id, label: m.name, hint: `Market · ${m.group}` })),
      ...view.pickers.suppliers.map((s) => ({ t: "supplier" as const, id: s.id, label: s.name, hint: `Supplier · ${s.where}` })),
    ],
    [view.pickers],
  );
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return all.filter((o) => `${o.label} ${o.hint}`.toLowerCase().includes(s)).slice(0, 30);
  }, [all, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = async (o: Option) => {
    await wl.toggle(o.t, o.id);
    onAdded();
  };

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2">
        <SearchField
            size="lg"
            wrapperClassName="flex-1"
            value={q}
            onValueChange={(v) => {
              setQ(v);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter" && results[active]) void pick(results[active]);
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Add to watchlist: search a chemical, seller product, market or supplier…"
            aria-label="Add to watchlist"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="watch-options"
          />
        <InfoTip title="What can I add?">
          <p><b>Chemicals</b>: market price, trend and import data. <b>Seller prices</b>: median asking price by city for a product. <b>Markets</b>: crude, gas, rupee, China futures. <b>Suppliers</b>: a company&apos;s listings and prices.</p>
        </InfoTip>
      </div>
      {open && results.length > 0 && (
        <ul id="watch-options" role="listbox" className="pop absolute top-[54px] right-0 left-0 z-30 max-h-96 overflow-y-auto p-1.5">
          {results.map((o, i) => {
            const on = wl.has(o.t, o.id);
            return (
              <li key={`${o.t}:${o.id}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => void pick(o)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}>
                  {o.slot ? <CategoryDot slot={o.slot} /> : <span className="size-2.5 rounded-sm bg-[var(--muted)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{o.label}</span>
                    <span className="block truncate text-xs text-muted">{o.hint}</span>
                  </span>
                  {on ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--warn)]">
                      <Star className="size-3.5 fill-[var(--warn)]" /> Added · click to remove
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink">
                      <Plus className="size-3.5" /> Add
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
