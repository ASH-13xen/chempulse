"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useId, useRef } from "react";

gsap.registerPlugin(useGSAP);

/** Tiny trend line. Colour follows the move over the shown window (with an end dot). */
export function Sparkline({ values, width = 120, height = 36, tone, animate = true, label }: { values: number[]; width?: number; height?: number; tone?: "up" | "down" | "flat"; animate?: boolean; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, "");
  useGSAP(
    () => {
      if (!animate || !ref.current) return;
      const path = ref.current.querySelector<SVGPathElement>("[data-line]");
      if (!path) return;
      const len = path.getTotalLength();
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out" });
        gsap.fromTo(ref.current!.querySelector("[data-area]"), { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.3 });
        gsap.fromTo(ref.current!.querySelector("[data-dot]"), { scale: 0, transformOrigin: "center" }, { scale: 1, duration: 0.4, delay: 0.9, ease: "back.out(3)" });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [values.length] },
  );

  if (values.length < 2) return <div style={{ width, height }} className="flex items-center text-xs text-muted">No data</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const dir = tone ?? (values[values.length - 1] > values[0] ? "up" : values[values.length - 1] < values[0] ? "down" : "flat");
  const color = dir === "up" ? "var(--up)" : dir === "down" ? "var(--down)" : "var(--muted)";
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);
  return (
    <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "Trend line"} className="overflow-visible">
      <defs>
        <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path data-area d={`${d}L${lastX},${height}L${x(0)},${height}Z`} fill={`url(#g${gid})`} />
      <path data-line d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle data-dot cx={lastX} cy={lastY} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
