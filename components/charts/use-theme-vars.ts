"use client";

import { useEffect, useState } from "react";

const NAMES = ["--surface", "--ink", "--ink-2", "--muted", "--grid", "--axis", "--up", "--down", "--accent", "--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8", "--line-strong", "--mid"] as const;
export type ThemeVars = Record<(typeof NAMES)[number], string>;

function read(): ThemeVars {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue(n).trim()])) as ThemeVars;
}

/** Resolved colour tokens; updates when the theme or colour mode changes. */
export function useThemeVars(): ThemeVars | null {
  const [vars, setVars] = useState<ThemeVars | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read CSS variables once mounted
    setVars(read());
    const mo = new MutationObserver(() =>
      setVars((prev) => {
        const next = read();
        return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      }),
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-colors", "style"] });
    return () => mo.disconnect();
  }, []);
  return vars;
}

export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
