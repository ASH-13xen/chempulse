"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Opt<T extends string> = { value: T; label: string; title?: string; disabled?: boolean };

/** Pill toggle group with a sliding highlight. */
export function Segmented<T extends string>({ value, onChange, options, size = "md", ariaLabel }: { value: T; onChange: (v: T) => void; options: Opt<T>[]; size?: "sm" | "md"; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    const ro = new ResizeObserver(() => {
      const e = wrap.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
      if (e) setInd({ left: e.offsetLeft, width: e.offsetWidth });
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, options.length]);

  const h = size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]";
  return (
    <div ref={wrap} role="radiogroup" aria-label={ariaLabel} className="relative inline-flex items-center rounded-[10px] border border-line bg-surface-2 p-0.5">
      {ind && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-[8px] bg-surface shadow-[var(--shadow-sm)] ring-1 ring-line transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ left: ind.left, width: ind.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-value={o.value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`relative z-10 ${h} rounded-[8px] px-2.5 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
            o.value === value ? "text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
