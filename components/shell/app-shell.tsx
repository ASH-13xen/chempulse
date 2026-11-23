"use client";

import { Bell, ChevronsLeft, CircleHelp, Keyboard, LogOut, Menu, Palette, Search, Settings2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog, DropdownMenu, Popover } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hrefFor } from "@/lib/catalog";
import { fmtAgo, fmtDate } from "@/lib/format";
import { ruleHit } from "@/lib/rules";
import type { Board } from "@/lib/types";
import { updateSettings, useSettings } from "../providers/settings";
import { MoneyProvider } from "../providers/money";
import { CommandPalette } from "./command-palette";
import { NAV } from "./nav";
import { ThemeToggle, useThemeSwitch } from "./theme-toggle";
import { Ticker } from "./ticker";
import { Tour } from "./tour";

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock starts after mount (avoids SSR mismatch)
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function AppShell({ board, authEnabled, children }: { board: Board; authEnabled: boolean; children: ReactNode }) {
  const settings = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const themeSwitch = useThemeSwitch();
  const mini = settings.sidebar === "mini";

  const startTour = useCallback(() => {
    if (pathname !== "/") router.push("/");
    setTimeout(() => setTourOpen(true), pathname === "/" ? 50 : 900);
  }, [pathname, router]);

  // First visit: offer the tour on the overview page.
  useEffect(() => {
    if (pathname === "/" && !settings.tourDone) {
      const t = setTimeout(() => setTourOpen(true), 1400);
      return () => clearTimeout(t);
    }
  }, [pathname, settings.tourDone]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigation closes the drawer
    setDrawer(false);
  }, [pathname]);

  // Keyboard shortcuts
  const gPressed = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") setKeysOpen(true);
      else if (e.key === "t" || e.key === "T") themeSwitch();
      else if (e.key === "p" || e.key === "P") window.print();
      else if (e.key === "g") gPressed.current = Date.now();
      else if (Date.now() - gPressed.current < 1200) {
        const n = NAV.find((x) => x.key === e.key);
        if (n) router.push(n.href);
        gPressed.current = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, themeSwitch]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className={`flex h-16 items-center gap-2.5 px-4 ${mini ? "justify-center px-0" : ""}`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="ChemPulse home">
          <Logo />
          {!mini && (
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-ink">ChemPulse</span>
              <span className="block text-[11px] text-muted">Chemical price trends</span>
            </span>
          )}
        </Link>
      </div>
      <ul className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                title={mini ? n.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors ${mini ? "justify-center px-0" : ""} ${
                  active ? "bg-surface text-ink shadow-[var(--shadow-sm)] ring-1 ring-line" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
                }`}
              >
                {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-[var(--accent)]" />}
                <n.icon className={`size-[18px] shrink-0 ${active ? "text-accent-ink" : ""}`} />
                {!mini && <span className="truncate">{n.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={`border-t border-line p-3 ${mini ? "flex flex-col items-center gap-2" : ""}`}>
        {!mini && (
          <button type="button" onClick={startTour} className="mb-2 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-left text-[13px] text-ink-2 hover:border-[var(--accent)] hover:text-ink">
            <Sparkles className="size-4 text-accent-ink" />
            <span>
              New here? <b className="font-semibold text-ink">Take the tour</b>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => updateSettings({ sidebar: mini ? "open" : "mini" })}
          className="hidden h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] text-muted hover:bg-surface/70 hover:text-ink lg:flex"
          aria-label={mini ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft className={`size-4 transition-transform ${mini ? "rotate-180" : ""}`} />
          {!mini && "Collapse"}
        </button>
      </div>
    </nav>
  );

  return (
    <MoneyProvider fx={{ usdinr: board.fx.usdinr, cnyinr: board.fx.cnyinr }}>
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen shrink-0 border-r border-line bg-page transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] lg:block ${mini ? "w-[76px]" : "w-[248px]"}`}>{sidebar}</aside>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[272px] border-r border-line bg-page shadow-[var(--shadow-lg)] lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <button type="button" onClick={() => setDrawer(false)} className="absolute top-4 right-3 rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--page)_82%,transparent)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <button
              type="button"
              data-tour="search"
              onClick={() => setPaletteOpen(true)}
              className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-left text-sm text-muted shadow-[var(--shadow-sm)] transition-colors hover:border-line-strong sm:max-w-[440px]"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">Search chemicals, CAS, HS code…</span>
              <span className="ml-auto hidden items-center gap-1 sm:flex">
                <span className="kbd">Ctrl</span>
                <span className="kbd">K</span>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <Status board={board} />
              <SignalsBell board={board} />
              <ThemeToggle />
              <SettingsMenu />
              <HelpMenu onTour={startTour} onKeys={() => setKeysOpen(true)} />
              {authEnabled && (
                <button
                  type="button"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={async () => {
                    await fetch("/api/login", { method: "DELETE" });
                    router.replace("/login");
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <LogOut className="size-[18px]" />
                </button>
              )}
            </div>
          </div>
          <Ticker rows={board.rows} />
        </header>

        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer data-noprint className="border-t border-line px-6 py-5 text-xs text-muted">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2">
            <span>Prices are indicative signals for spotting trends, not quotes. Confirm with suppliers before buying or costing.</span>
            <span className="ml-auto">
              Data: China futures exchanges (via AkShare), FRED/EIA, ECB, Tradestat (DGCI&S), Google News. Charts: TradingView Lightweight Charts™.
            </span>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} rows={board.rows} onTheme={() => themeSwitch()} onTour={startTour} />
      <Tour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          updateSettings({ tourDone: true });
        }}
      />
      <ShortcutsDialog open={keysOpen} onOpenChange={setKeysOpen} />
    </div>
    </MoneyProvider>
  );
}

function Logo() {
  return (
    <span className="relative inline-flex size-9 items-center justify-center rounded-[11px] bg-ink text-surface shadow-[var(--shadow-md)]">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 13h3l2.5-6 4 11 3-8 1.5 3H21" />
      </svg>
      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--page)] bg-[var(--up)]" />
    </span>
  );
}

function Status({ board }: { board: Board }) {
  const now = useNow();
  const ok = Object.values(board.sources).filter(Boolean).every((r) => r!.ok);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" data-tour="status" className="mr-1 hidden h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-2 hover:border-line-strong md:inline-flex">
          <span className={ok ? "live-dot" : "size-2 rounded-full bg-[var(--warn)]"} />
          {now ? `Checked ${fmtAgo(board.lastChecked, now)}` : "Checking…"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="pop w-[320px] p-4 text-sm">
          <div className="font-semibold text-ink">Data freshness</div>
          <p className="mt-1 text-[13px] text-ink-2">The collector runs every 3 hours. A price is saved only when it changes; otherwise nothing is written.</p>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">Last check</dt>
              <dd className="font-medium text-ink">{now ? fmtAgo(board.lastChecked, now) : "–"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Last price change saved</dt>
              <dd className="font-medium text-ink">{now ? fmtAgo(board.lastChanged, now) : "–"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Latest China trading day</dt>
              <dd className="font-medium text-ink">{fmtDate(board.asOf, "long")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Storage</dt>
              <dd className="font-medium text-ink">{board.storage === "mongo" ? "MongoDB Atlas" : "Local snapshot"}</dd>
            </div>
          </dl>
          <Link href="/data" className="mt-3 inline-block text-[13px] font-medium text-accent-ink hover:underline">
            See every source →
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SignalsBell({ board }: { board: Board }) {
  const settings = useSettings();
  const rowsById = useMemo(() => Object.fromEntries(board.rows.map((r) => [r.id, r])), [board.rows]);
  const recent = board.events.slice(0, 8);
  const newest = board.events[0]?.d ?? null;
  const weekAgo = newest ? new Date(Date.parse(newest) - 7 * 86400000).toISOString().slice(0, 10) : "";
  const unseen = board.events.filter((e) => e.d >= weekAgo && (!settings.seenSignals || e.d > settings.seenSignals)).length;
  const hits = settings.rules.filter((r) => ruleHit(r, rowsById[r.target]));
  const count = Math.min(99, unseen + hits.length);
  return (
    <Popover.Root onOpenChange={(o) => o && newest && updateSettings({ seenSignals: newest })}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Signals${count ? `, ${count} new` : ""}`} className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Bell className="size-[18px]" />
          {count > 0 && <span className="tnum absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--down)] px-1 text-[10px] leading-4 font-semibold text-white">{count}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="pop w-[380px] p-2">
          {hits.length > 0 && (
            <div className="mb-1 rounded-lg bg-surface-2 p-3">
              <div className="text-xs font-semibold text-ink">Your alert rules triggered ({hits.length})</div>
              <ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">
                {hits.slice(0, 4).map((h) => (
                  <li key={h.id}>• {rowsById[h.target]?.name}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Latest signals</div>
          <ul>
            {recent.map((e) => (
              <li key={e.id}>
                <Link href={hrefFor(e.rowId)} className="block rounded-lg px-3 py-2 hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">{e.name}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtDate(e.d)}</span>
                  </div>
                  <div className="line-clamp-2 text-[13px] text-ink-2">{e.text}</div>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/alerts" className="mt-1 block rounded-lg px-3 py-2 text-center text-[13px] font-medium text-accent-ink hover:bg-surface-2">
            All signals & alert rules →
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SettingsMenu() {
  const s = useSettings();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" data-tour="settings" aria-label="Display settings" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Settings2 className="size-[18px]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="pop w-[290px] p-1.5">
          <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            {[
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "Match my device"],
            ].map(([v, l]) => (
              <DropdownMenu.RadioItem key={v} value={v} className="menu-item">
                <Radio on={(theme ?? "system") === v} /> {l}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--line)]" />
          <DropdownMenu.Label className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            <Palette className="size-3.5" /> Up / down colours
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={s.colours} onValueChange={(v) => updateSettings({ colours: v as "market" | "cb" })}>
            <DropdownMenu.RadioItem value="market" className="menu-item">
              <Radio on={s.colours === "market"} /> Market (green / red)
              <span className="ml-auto flex gap-1">
                <i className="size-3 rounded-sm bg-[#0ca30c]" />
                <i className="size-3 rounded-sm bg-[#d03b3b]" />
              </span>
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="cb" className="menu-item">
              <Radio on={s.colours === "cb"} /> Colour-blind safe
              <span className="ml-auto flex gap-1">
                <i className="size-3 rounded-sm bg-[#2a78d6]" />
                <i className="size-3 rounded-sm bg-[#eb6834]" />
              </span>
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--line)]" />
          <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Show prices in</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={s.prices} onValueChange={(v) => updateSettings({ prices: v as "native" | "inr" | "usd" })}>
            <DropdownMenu.RadioItem value="inr" className="menu-item">
              <Radio on={s.prices === "inr"} /> ₹ Rupees (per kg)
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="usd" className="menu-item">
              <Radio on={s.prices === "usd"} /> $ US dollars (per kg)
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="native" className="menu-item">
              <Radio on={s.prices === "native"} /> Original units (¥/t, $/bbl, ₹/kg)
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <p className="px-2.5 pt-1 pb-2 text-[11px] leading-snug text-muted">Converted with ECB exchange rates (charts use each day&apos;s rate). China prices include China VAT and exclude freight and duty.</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Radio({ on }: { on: boolean }) {
  return <span aria-hidden className={`inline-flex size-4 items-center justify-center rounded-full border ${on ? "border-[var(--accent)]" : "border-line-strong"}`}>{on && <span className="size-2 rounded-full bg-[var(--accent)]" />}</span>;
}

function HelpMenu({ onTour, onKeys }: { onTour: () => void; onKeys: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" data-tour="help" aria-label="Help" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
          <CircleHelp className="size-[18px]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="pop w-[240px] p-1.5">
          <DropdownMenu.Item className="menu-item" onSelect={onTour}>
            <Sparkles className="size-4 text-ink-2" /> Guided tour
          </DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item" onSelect={onKeys}>
            <Keyboard className="size-4 text-ink-2" /> Keyboard shortcuts <span className="kbd ml-auto">?</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item" asChild>
            <Link href="/data">
              <CircleHelp className="size-4 text-ink-2" /> How the numbers are made
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows: [string, ReactNode][] = [
    ["Search everything", <><span className="kbd">Ctrl</span> <span className="kbd">K</span> or <span className="kbd">/</span></>],
    ["Toggle light / dark", <span key="t" className="kbd">T</span>],
    ["Save page as PDF", <span key="p" className="kbd">P</span>],
    ["Show shortcuts", <span key="q" className="kbd">?</span>],
    ...NAV.map((n) => [`Go to ${n.label}`, <><span className="kbd">G</span> then <span className="kbd">{n.key.toUpperCase()}</span></>] as [string, ReactNode]),
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="pop fixed top-1/2 left-1/2 z-50 w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 p-6">
          <Dialog.Title className="text-base font-semibold text-ink">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-2">Work faster without the mouse.</Dialog.Description>
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {rows.map(([label, keys]) => (
              <li key={label} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-2">{label}</span>
                <span className="flex items-center gap-1 text-xs text-muted">{keys}</span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
