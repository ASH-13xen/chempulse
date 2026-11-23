"use client";

import { ArrowRight, CornerDownLeft, FileDown, Moon, Search, Sparkles, Star, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { categoryById, chemicalById, hrefFor } from "@/lib/catalog";
import { useMoney } from "../providers/money";
import type { Row } from "@/lib/types";
import { Change, CategoryDot } from "../ui/change";
import { toggleWatchItem, useWatchlist } from "../providers/watchlist";
import { products } from "@/lib/products";
import { NAV } from "./nav";

type Item = { id: string; group: string; label: string; hint?: string; keywords: string; icon?: ReactNode; right?: ReactNode; run: () => void };

export function CommandPalette({ open, onOpenChange, rows, onTheme, onTour }: { open: boolean; onOpenChange: (o: boolean) => void; rows: Row[]; onTheme: () => void; onTour: () => void }) {
  const router = useRouter();
  const wl = useWatchlist();
  const money = useMoney();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      onOpenChange(false);
      router.push(href);
    };
    const chem: Item[] = rows
      .filter((r) => r.type === "chemical")
      .map((r) => {
        const c = chemicalById[r.id];
        const cat = categoryById[c.category];
        return {
          id: r.id,
          group: "Chemicals",
          label: r.name,
          hint: `${cat.name}${c.cas ? ` · CAS ${c.cas}` : ""} · HS ${c.hs.join(", ")}`,
          keywords: `${r.name} ${r.short} ${c.cas} ${c.hs.join(" ")} ${cat.name}`.toLowerCase(),
          icon: <CategoryDot slot={cat.slot} />,
          right: (
            <span className="flex items-center gap-3">
              {wl.has("chem", r.id) && <Star className="size-3.5 fill-[var(--warn)] text-[var(--warn)]" />}
              <span className="tnum text-xs text-ink-2">{money.fmt(r.last, r.unit)}</span>
              <Change value={r.frequency === "daily" ? r.changes.d1 : r.changes.m1} size="xs" />
            </span>
          ),
          run: go(hrefFor(r.id)),
        };
      });
    const mkts: Item[] = rows
      .filter((r) => r.type === "market")
      .map((r) => ({
        id: r.id,
        group: "Markets & drivers",
        label: r.name,
        hint: r.group ?? "",
        keywords: `${r.name} ${r.short} ${r.group}`.toLowerCase(),
        icon: <span className="size-2.5 rounded-sm bg-[var(--muted)]" />,
        right: (
          <span className="flex items-center gap-3">
            <span className="tnum text-xs text-ink-2">{money.fmt(r.last, r.unit)}</span>
            <Change value={r.changes.d1} size="xs" />
          </span>
        ),
        run: go(hrefFor(r.id)),
      }));
    const prods: Item[] = products
      .filter((p) => !p.virtual)
      .map((p) => ({
        id: `product:${p.id}`,
        group: "Seller prices",
        label: `${p.name}: sellers & asking prices`,
        hint: `${categoryById[p.category].name} · IndiaMART, TradeIndia, briefs`,
        keywords: `${p.name} sellers suppliers price ${categoryById[p.category].name}`.toLowerCase(),
        icon: <CategoryDot slot={categoryById[p.category].slot} />,
        run: go(`/products/${p.id}`),
      }));
    const pages: Item[] = NAV.map((n) => ({
      id: `page:${n.href}`,
      group: "Pages",
      label: n.label,
      hint: n.desc,
      keywords: `${n.label} ${n.desc}`.toLowerCase(),
      icon: <n.icon className="size-4 text-ink-2" />,
      right: <span className="kbd">g {n.key}</span>,
      run: go(n.href),
    }));
    const actions: Item[] = [
      { id: "a:theme", group: "Actions", label: "Toggle light / dark theme", keywords: "theme dark light mode", icon: <Moon className="size-4 text-ink-2" />, right: <span className="kbd">T</span>, run: () => (onOpenChange(false), onTheme()) },
      { id: "a:tour", group: "Actions", label: "Take the guided tour", keywords: "tour help guide how", icon: <Sparkles className="size-4 text-ink-2" />, run: () => (onOpenChange(false), onTour()) },
      { id: "a:pdf", group: "Actions", label: "Download this page as PDF", keywords: "pdf print report download", icon: <FileDown className="size-4 text-ink-2" />, right: <span className="kbd">P</span>, run: () => (onOpenChange(false), setTimeout(() => window.print(), 250)) },
    ];
    return [...chem, ...mkts, ...prods, ...pages, ...actions];
  }, [rows, router, onOpenChange, onTheme, onTour, wl, money]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    const terms = s.split(/\s+/);
    return items
      .filter((i) => terms.every((t) => i.keywords.includes(t)))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(s)) - Number(a.label.toLowerCase().startsWith(s)));
  }, [items, q]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the palette each time it opens
      setQ("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_.15s]" />
        <Dialog.Content
          className="pop fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden p-0"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[active]?.run();
            } else if ((e.key === "s" || e.key === "S") && e.altKey && filtered[active] && chemicalById[filtered[active].id]) {
              void toggleWatchItem("chem", filtered[active].id);
            }
          }}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Search chemicals, markets, pages and actions</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search aria-hidden className="size-5 shrink-0 text-accent-ink" />
            <input
              autoFocus
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder="Search chemicals, CAS or HS code, markets, pages…"
              className="h-[60px] min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
              aria-label="Search"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQ("");
                  setActive(0);
                }}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
            <span className="kbd hidden shrink-0 sm:inline-flex">Esc</span>
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {filtered.length === 0 && <div className="px-3 py-10 text-center text-sm text-ink-2">No matches for “{q}”.</div>}
            {filtered.map((it, idx) => {
              const header = idx === 0 || filtered[idx - 1].group !== it.group ? it.group : null;
              return (
                <div key={it.id}>
                  {header && <div className="px-3 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    data-idx={idx}
                    onMouseMove={() => setActive(idx)}
                    onClick={it.run}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${idx === active ? "bg-surface-2" : ""}`}
                  >
                    <span className="flex size-5 items-center justify-center">{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{it.label}</span>
                      {it.hint && <span className="block truncate text-xs text-muted">{it.hint}</span>}
                    </span>
                    {it.right}
                    {idx === active && <ArrowRight className="size-4 text-ink-2" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> move
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">
                <CornerDownLeft className="size-3" />
              </span>{" "}
              open
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">Alt</span>+<span className="kbd">S</span> star chemical
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
