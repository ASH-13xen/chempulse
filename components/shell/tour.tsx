"use client";

import gsap from "gsap";
import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STEPS = [
  { target: "search", title: "Search anything", body: "Press Ctrl + K (or /) to jump to any chemical, CAS number, HS code, market or page." },
  { target: "ticker", title: "Live price tape", body: "Daily prices scroll here like a stock ticker. Hover to pause, click a name to open it." },
  { target: "status", title: "How fresh is the data", body: "Prices are checked every 3 hours. A price is only saved when it actually changes." },
  { target: "period", title: "Pick a time window", body: "Every number, ranking and bar below follows this window: 1 week, 1 month, 3 months…" },
  { target: "tiles", title: "The market at a glance", body: "How many chemicals are trending up or down, how many made an unusual move, and the biggest mover." },
  { target: "movers", title: "Biggest movers", body: "The strongest risers and fallers in the window you picked. Click any row to see its chart." },
  { target: "signals", title: "Signals, found for you", body: "Trend turns, 52-week highs and lows, and moves much bigger than normal, spotted automatically." },
  { target: "grid", title: "Your chemicals", body: "Star a chemical to add it to your watchlist. 'Daily' chemicals have daily prices; 'Monthly' ones use India's import data." },
  { target: "settings", title: "Make it yours", body: "Switch colours (including a colour-blind safe mode) and show China prices in approximate ₹ per kg." },
  { target: "help", title: "Help is always one click away", body: "Look for the (i) buttons: every chart and number explains itself. Restart this tour from the help menu." },
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const spot = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const visibleSteps = useCallback(() => STEPS.filter((s) => document.querySelector(`[data-tour="${s.target}"]`)), []);
  const [steps, setSteps] = useState(STEPS);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- start from the first step each time
      setSteps(visibleSteps());
      setI(0);
    }
  }, [open, visibleSteps]);

  const place = useCallback(() => {
    const step = steps[i];
    const el = step && document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el || !spot.current) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    gsap.to(spot.current, { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, duration: 0.45, ease: "power3.inOut" });
    const below = r.bottom + 200 < window.innerHeight;
    const left = Math.min(Math.max(12, r.left), window.innerWidth - 352);
    setPos({ top: below ? r.bottom + 14 : r.top - 14, left, below });
  }, [steps, i]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = steps[i];
    const el = step && document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(place, 380);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, i, steps, place]);

  useEffect(() => {
    if (card.current && pos) gsap.fromTo(card.current, { opacity: 0, y: pos.below ? 8 : -8 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
  }, [pos, i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  if (!open || !steps.length) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0" onClick={onClose} />
      <div ref={spot} className="pointer-events-none fixed rounded-2xl ring-2 ring-[var(--accent)]" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", left: "50%", top: "50%", width: 0, height: 0 }} />
      {pos && (
        <div
          ref={card}
          className="pop fixed w-[340px] p-5"
          style={{ left: pos.left, top: pos.top, transform: pos.below ? undefined : "translateY(-100%)" }}
        >
          <button type="button" onClick={onClose} aria-label="Close tour" className="absolute top-3 right-3 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
          <div className="text-xs font-medium text-accent-ink">
            Step {i + 1} of {steps.length}
          </div>
          <div className="mt-1 text-base font-semibold text-ink">{step.title}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, k) => (
                <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-[var(--accent)]" : "w-1.5 bg-[var(--line-strong)]"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              {i > 0 && (
                <button type="button" className="btn h-8 px-3 text-[0.8125rem]" onClick={() => setI(i - 1)}>
                  Back
                </button>
              )}
              <button type="button" className="btn btn-primary h-8 px-3 text-[0.8125rem]" onClick={() => (last ? onClose() : setI(i + 1))}>
                {last ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
