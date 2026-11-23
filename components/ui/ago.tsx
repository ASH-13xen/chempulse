"use client";

import { useEffect, useState } from "react";
import { fmtAgo } from "@/lib/format";

/** "3 h ago", computed in the browser so it never goes stale in a cached page. */
export function Ago({ iso }: { iso: string | null | undefined }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock starts after mount
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span>never</span>;
  return <span title={new Date(iso).toLocaleString("en-IN")}>{now ? fmtAgo(iso, now) : iso.slice(0, 16).replace("T", " ")}</span>;
}
