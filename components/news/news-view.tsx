"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categories, categoryById, chemicalById, hrefFor } from "@/lib/catalog";
import { fmtDate } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { CategoryDot } from "../ui/change";
import { Reveal } from "../ui/motion";
import { SearchField } from "@/components/ui/search-field";

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
        <SearchField value={q} onValueChange={setQ} placeholder="Search headlines…" aria-label="Search headlines" wrapperClassName="w-full sm:w-72" />
        <select value={cat} onChange={(e) => (setCat(e.target.value), setChem("all"))} className="input h-9 min-w-0 flex-1 sm:w-auto sm:flex-none" aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={chem} onChange={(e) => setChem(e.target.value)} className="input h-9 min-w-0 flex-1 sm:w-auto sm:flex-none" aria-label="Chemical">
          <option value="all">All chemicals</option>
          {Object.values(chemicalById)
            .filter((c) => cat === "all" || c.category === cat)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <span className="ml-auto text-[0.8125rem] text-ink-2">{list.length} headlines</span>
      </div>
      {byDay.map(([day, items]) => (
        <section key={day} data-reveal className="space-y-2">
          <h2 className="sticky top-[7rem] z-10 bg-page/90 py-1 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur">{fmtDate(day, "long")}</h2>
          <div className="card divide-y divide-[var(--line)]">
            {items.map((n) => {
              const c = chemicalById[n.chem];
              return (
                <div key={n.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5 sm:py-3.5">
                  <Link href={hrefFor(c.id)} className="inline-flex min-w-0 shrink-0 items-center gap-2 sm:mt-0.5 sm:w-44 text-[0.8125rem] font-medium text-ink-2 hover:text-accent-ink">
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
