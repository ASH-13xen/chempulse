"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? "Could not sign in.");
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4">
      <div aria-hidden className="hero-grid absolute inset-0 opacity-70" />
      <div aria-hidden className="absolute top-1/4 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-[var(--accent)] opacity-[0.08] blur-3xl" />
      <form onSubmit={submit} className="card relative w-full max-w-sm p-8 shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-ink text-surface">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 13h3l2.5-6 4 11 3-8 1.5 3H21" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">ChemPulse</h1>
            <p className="text-[13px] text-ink-2">Chemical price trends</p>
          </div>
        </div>
        <label className="mt-7 block text-sm font-medium text-ink">
          Password
          <div className="relative mt-1.5">
            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input type="password" autoFocus autoComplete="current-password" className="input h-11 pl-9" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
        </label>
        {err && <p className="mt-2 text-[13px] text-down-ink">{err}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary mt-5 h-11 w-full justify-center">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
