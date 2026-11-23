"use client";

import { useEffect, useSyncExternalStore } from "react";

export type AlertRule = {
  id: string;
  target: string; // row id (chemical or market)
  metric: "last" | "d1" | "w1" | "m1" | "m3" | "y1";
  op: ">" | "<";
  value: number;
  createdAt: string;
};

export type Settings = {
  colours: "market" | "cb";
  prices: "native" | "inr" | "usd"; // currency for every price on the site
  watchlist: string[]; // legacy chemical stars; moved into the database-backed watchlist on first load
  rules: AlertRule[];
  tourDone: boolean;
  sidebar: "open" | "mini";
  seenSignals: string | null; // ISO date of the newest signal the user has seen
};

const KEY = "chempulse.settings.v1";
const DEFAULTS: Settings = {
  colours: "market",
  prices: "inr",
  watchlist: ["pp", "pvc", "toluene", "methanol"],
  rules: [],
  tourDone: false,
  sidebar: "open",
  seenSignals: null,
};

let state: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    state = DEFAULTS;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  load();
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => DEFAULTS,
  );
}

/** Keeps <html data-colors> in sync with the colour setting. */
export function SettingsEffects() {
  const { colours } = useSettings();
  useEffect(() => {
    document.documentElement.dataset.colors = colours;
  }, [colours]);
  return null;
}
