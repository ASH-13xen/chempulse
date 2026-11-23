"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { hrefFor } from "@/lib/catalog";
import { fmtPct } from "@/lib/format";
import { useMoney } from "../providers/money";
import type { Row } from "@/lib/types";

/** Endless price tape like a trading floor. Hover to pause. */
export function Ticker({ rows }: { rows: Row[] }) {
  const track = useRef<HTMLDivElement>(null);
  const money = useMoney();
  const tween = useRef<gsap.core.Tween | null>(null);
  const items = rows.filter((r) => r.frequency === "daily" && r.last != null);

  useEffect(() => {
    const el = track.current;
    if (!el || !items.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const half = el.scrollWidth / 2;
    tween.current = gsap.fromTo(el, { x: 0 }, { x: -half, duration: half / 38, ease: "none", repeat: -1 });
    return () => {
      tween.current?.kill();
    };
  }, [items.length]);

  if (!items.length) return null;
  const list = [...items, ...items];
  return (
    <div
      data-tour="ticker"
      className="relative overflow-hidden border-b border-line bg-surface"
      onMouseEnter={() => tween.current?.pause()}
      onMouseLeave={() => tween.current?.resume()}
      onFocus={() => tween.current?.pause()}
      onBlur={() => tween.current?.resume()}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[var(--surface)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[var(--surface)] to-transparent" />
      <div ref={track} className="flex w-max items-center gap-1 py-1.5 will-change-transform">
        {list.map((r, i) => {
          const c = r.changes.d1;
          return (
            <Link
              key={`${r.id}-${i}`}
              href={hrefFor(r.id)}
              tabIndex={i >= items.length ? -1 : 0}
              aria-hidden={i >= items.length}
              className="group flex items-center gap-2 rounded-md px-3 py-0.5 text-[13px] whitespace-nowrap hover:bg-surface-2"
            >
              <span className="font-semibold text-ink group-hover:text-accent-ink">{r.short}</span>
              <span className="tnum text-ink-2">{money.fmt(r.last, r.unit)}</span>
              <span className={`tnum font-medium ${c == null ? "text-muted" : c > 0 ? "text-up-ink" : c < 0 ? "text-down-ink" : "text-ink-2"}`}>
                {c == null ? "" : c > 0 ? "▲" : c < 0 ? "▼" : "■"} {fmtPct(c, 2)}
              </span>
              <span aria-hidden className="ml-1 h-3 w-px bg-[var(--line-strong)]" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
