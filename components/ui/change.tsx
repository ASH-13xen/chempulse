import { fmtPct } from "@/lib/format";

/** A signed % change with an arrow, so direction never depends on colour alone. */
export function Change({ value, digits = 1, pill = false, size = "sm", className = "" }: { value: number | null | undefined; digits?: number; pill?: boolean; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const sizes = { xs: "text-xs", sm: "text-sm", md: "text-base", lg: "text-lg" };
  if (value == null || !Number.isFinite(value)) return <span className={`tnum text-muted ${sizes[size]} ${className}`}>–</span>;
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const color = flat ? "text-ink-2" : up ? "text-up-ink" : "text-down-ink";
  const arrow = flat ? "■" : up ? "▲" : "▼";
  const bg = pill ? (flat ? "bg-surface-2" : up ? "bg-[color-mix(in_oklab,var(--up)_12%,transparent)]" : "bg-[color-mix(in_oklab,var(--down)_12%,transparent)]") : "";
  return (
    <span className={`tnum inline-flex items-center gap-1 whitespace-nowrap font-medium ${color} ${sizes[size]} ${pill ? `rounded-md px-1.5 py-0.5 ${bg}` : ""} ${className}`}>
      <span aria-hidden className="text-[0.7em] leading-none">
        {arrow}
      </span>
      {fmtPct(value, digits)}
    </span>
  );
}

export function TrendBadge({ dir, compact = false }: { dir: "up" | "down" | "flat"; compact?: boolean }) {
  const map = {
    up: { label: "Uptrend", cls: "text-up-ink bg-[color-mix(in_oklab,var(--up)_12%,transparent)]", icon: "↗" },
    down: { label: "Downtrend", cls: "text-down-ink bg-[color-mix(in_oklab,var(--down)_12%,transparent)]", icon: "↘" },
    flat: { label: "Sideways", cls: "text-ink-2 bg-surface-2", icon: "→" },
  }[dir];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map.cls}`}>
      <span aria-hidden>{map.icon}</span>
      {compact ? null : map.label}
      {compact && <span className="sr-only">{map.label}</span>}
    </span>
  );
}

export function FreqBadge({ frequency }: { frequency: "daily" | "monthly" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
        frequency === "daily" ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] text-accent-ink" : "border-line text-muted"
      }`}
      title={frequency === "daily" ? "Daily prices" : "Monthly data (India imports)"}
    >
      {frequency === "daily" ? "Daily" : "Monthly"}
    </span>
  );
}

export function CategoryDot({ slot, className = "" }: { slot: number; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${className}`} style={{ background: `var(--s${slot})` }} />;
}
