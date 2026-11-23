"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

/** Fades and lifts every [data-reveal] child in, one after another. */
export function Reveal({ children, className = "", stagger = 0.05 }: { children: ReactNode; className?: string; stagger?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-reveal]", { y: 18, opacity: 0, duration: 0.6, ease: "power3.out", stagger, clearProps: "transform,opacity" });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Counts up to a number once, on mount. */
export function CountUp({ value, format, className = "" }: { value: number | null; format: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (value == null || !ref.current) return;
      const el = ref.current;
      const obj = { v: value * 0.82 };
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(obj, {
          v: value,
          duration: 1.1,
          ease: "power3.out",
          onUpdate: () => {
            el.textContent = format(obj.v);
          },
        });
      });
      return () => mm.revert();
    },
    { dependencies: [value] },
  );
  return (
    <span ref={ref} className={className}>
      {value == null ? "–" : format(value)}
    </span>
  );
}
