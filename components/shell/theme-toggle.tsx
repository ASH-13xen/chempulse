"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

const noop = () => () => {};

/** Switches light/dark with a circular reveal that grows from the button. */
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (origin?: { x: number; y: number }) => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const apply = () => {
      flushSync(() => setTheme(next));
      document.documentElement.classList.toggle("dark", next === "dark");
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    const x = origin?.x ?? window.innerWidth - 40;
    const y = origin?.y ?? 30;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const t = doc.startViewTransition(apply);
    t.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 600, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  };
}

export function ThemeToggle() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const toggle = useThemeSwitch();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={(e) => toggle({ x: e.clientX, y: e.clientY })}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme (T)"
      className="relative inline-flex size-9 items-center justify-center overflow-hidden rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Sun className={`absolute size-[18px] transition-all duration-500 ${dark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`} />
      <Moon className={`absolute size-[18px] transition-all duration-500 ${dark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"}`} />
    </button>
  );
}
