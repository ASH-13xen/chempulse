"use client";

import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categories, categoryById, chemicalById, hrefFor } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { CategoryDot } from "../ui/change";
import { Reveal } from "../ui/motion";

export function NewsView({ news }: { news: NewsItem[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [chem, setChem] = useState("all");
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return news.filter((n) => {
      const c = chemicalById[n.chem];
      if (!c) return false;
      if (cat !== "all" && c.category !== cat) return false;
      if (chem !== "all" && n.chem !== chem) return false;
      if (s && !`${n.title} ${n.source} ${c.name}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [news, q, cat, chem]);
  const byDay = useMemo(() => {
    const m = new Map<string, NewsItem[]>();
    for (const n of list) {
      const d = n.published.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), n]);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <Reveal className="space-y-5">
      <div data-reveal>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">News</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Headlines from the last 30 days that name a tracked chemical together with a price, supply, plant or trade word. Read every 6 hours from Google News (India edition).</p>
      </div>
      <div data-reveal className="card flex flex-wrap items-center gap-2 p-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines…" className="input pl-9" aria-label="Search headlines" />
        </div>
        <select value={cat} onChange={(e) => (setCat(e.target.value), setChem("all"))} className="input h-9 w-auto" aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={chem} onChange={(e) => setChem(e.target.value)} className="input h-9 w-auto" aria-label="Chemical">
          <option value="all">All chemicals</option>
          {Object.values(chemicalById)
            .filter((c) => cat === "all" || c.category === cat)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <span className="ml-auto text-[13px] text-ink-2">{list.length} headlines</span>
      </div>
      {byDay.map(([day, items]) => (
        <section key={day} data-reveal className="space-y-2">
          <h2 className="sticky top-[112px] z-10 bg-page/90 py-1 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur">{fmtDate(day, "long")}</h2>
          <div className="card divide-y divide-[var(--line)]">
            {items.map((n) => {
              const c = chemicalById[n.chem];
              return (
                <div key={n.id} className="flex items-start gap-4 px-5 py-3.5">
                  <Link href={hrefFor(c.id)} className="mt-0.5 inline-flex w-44 shrink-0 items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-accent-ink">
                    <CategoryDot slot={categoryById[c.category].slot} />
                    <span className="truncate">{c.name}</span>
                  </Link>
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink group-hover:text-accent-ink">
                      {n.title} <ExternalLink className="ml-1 inline size-3 text-muted" />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{n.source}</div>
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {!list.length && <div className="card p-12 text-center text-sm text-ink-2">No headlines match.</div>}
    </Reveal>
  );
}
