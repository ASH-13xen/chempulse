"use client";

import { useEffect, useSyncExternalStore } from "react";
import { chemicalById, marketById } from "@/lib/catalog";

export type WatchKind = "chem" | "market" | "product" | "supplier";
export type WatchItem = { t: WatchKind; id: string; addedAt?: string };

/**
 * The watchlist is saved in MongoDB (via /api/watchlist) so it follows the user
 * across browsers. A copy is kept in localStorage for an instant first render and
 * as a fallback when the database is not configured.
 */
const LS = "chempulse.watchlist.v2";
const MIGRATED = "chempulse.watchlist.migrated";
const EMPTY: WatchItem[] = [];
let items: WatchItem[] = EMPTY;
let remote = true;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function saveLocal() {
  try {
    localStorage.setItem(LS, JSON.stringify(items));
  } catch {
    /* private mode */
  }
}

function legacyStars(): string[] {
  try {
    const s = JSON.parse(localStorage.getItem("chempulse.settings.v1") || "{}");
    return Array.isArray(s.watchlist) ? s.watchlist : ["pp", "pvc", "toluene", "methanol"];
  } catch {
    return [];
  }
}

async function send(method: "POST" | "DELETE", t: WatchKind, id: string) {
  if (!remote) return;
  try {
    const res = method === "POST" ? await fetch("/api/watchlist", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ t, id }) }) : await fetch(`/api/watchlist?t=${t}&id=${encodeURIComponent(id)}`, { method });
    if (res.status === 400) remote = false;
  } catch {
    /* keep the local copy; it syncs next time */
  }
}

async function start() {
  if (started) return;
  started = true;
  try {
    items = JSON.parse(localStorage.getItem(LS) || "[]");
  } catch {
    items = [];
  }
  emit();
  try {
    const res = await fetch("/api/watchlist", { cache: "no-store" });
    if (res.ok) items = (await res.json()).items ?? [];
    else remote = false;
  } catch {
    remote = false;
  }
  // one-time move of the old chemical stars into the new watchlist
  if (!localStorage.getItem(MIGRATED)) {
    for (const id of legacyStars()) {
      const t: WatchKind | null = chemicalById[id] ? "chem" : marketById[id] ? "market" : null;
      if (t && !items.some((i) => i.t === t && i.id === id)) {
        items = [...items, { t, id, addedAt: new Date().toISOString() }];
        await send("POST", t, id);
      }
    }
    localStorage.setItem(MIGRATED, "1");
  }
  saveLocal();
  emit();
}

export function isWatched(list: WatchItem[], t: WatchKind, id: string) {
  return list.some((i) => i.t === t && i.id === id);
}

export async function toggleWatchItem(t: WatchKind, id: string) {
  const on = isWatched(items, t, id);
  items = on ? items.filter((i) => !(i.t === t && i.id === id)) : [...items, { t, id, addedAt: new Date().toISOString() }];
  saveLocal();
  emit();
  await send(on ? "DELETE" : "POST", t, id);
}

export function useWatchlist() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => items,
    () => EMPTY,
  );
  useEffect(() => {
    void start();
  }, []);
  return {
    items: list,
    has: (t: WatchKind, id: string) => isWatched(list, t, id),
    toggle: toggleWatchItem,
    count: (t?: WatchKind) => (t ? list.filter((i) => i.t === t).length : list.length),
  };
}
