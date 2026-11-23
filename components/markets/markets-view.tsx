"use client";

import Link from "next/link";
import { useState } from "react";
import { hrefFor } from "@/lib/catalog";
import { fmtDate, PERIOD_LABEL } from "@/lib/format";
import type { Board, PeriodKey, Row } from "@/lib/types";
import { Change } from "../ui/change";
import { InfoTip } from "../ui/info-tip";
import { Reveal } from "../ui/motion";
import { PriceText, RangeBar } from "../ui/row-bits";
import { Segmented } from "../ui/segmented";
import { Sparkline } from "../ui/sparkline";

const GROUPS: { id: string; title: string; about: string }[] = [
  { id: "Energy", title: "Energy", about: "Crude oil, natural gas and propane set the cost floor for most petrochemicals. FRED publishes these a few days late." },
  { id: "Currency", title: "Currency", about: "A weaker rupee makes imports dearer. The yuan rate converts China prices into rupees." },
  { id: "China futures", title: "China futures", about: "Most-traded contracts on China's commodity exchanges. Updated every trading day, including intraday moves when the collector runs during trading hours." },
];

export function MarketsView({ board }: { board: Board }) {
  const [period, setPeriod] = useState<PeriodKey>("m1");
  const markets = board.rows.filter((r) => r.type === "market");
  return (
    <Reveal className="space-y-8">
      <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Markets & drivers</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">The traded markets that move chemical prices first. Chemical pages compare themselves against the drivers that matter for them.</p>
        </div>
        <Segmented
          ariaLabel="Change window"
          value={period}
          onChange={setPeriod}
          options={(["d1", "w1", "m1", "m3", "y1"] as PeriodKey[]).map((p) => ({ value: p, label: p === "d1" ? "1D" : p === "w1" ? "1W" : p === "m1" ? "1M" : p === "m3" ? "3M" : "1Y" }))}
        />
      </div>
      {GROUPS.map((g) => (
        <section key={g.id} className="space-y-3">
          <h2 data-reveal className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-ink">
            {g.title}
            <InfoTip title={g.title}>
              <p>{g.about}</p>
            </InfoTip>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {markets
              .filter((m) => m.group === g.id)
              .map((m) => (
                <MarketCard key={m.id} row={m} period={period} />
              ))}
          </div>
        </section>
      ))}
    </Reveal>
  );
}

function MarketCard({ row: r, period }: { row: Row; period: PeriodKey }) {
  return (
    <Link href={hrefFor(r.id)} data-reveal className="card card-hover group block p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink group-hover:text-accent-ink">{r.name}</div>
          <div className="text-xs text-muted">
            {r.short} · {fmtDate(r.lastDate)}
          </div>
        </div>
        <Change value={r.changes[period]} pill />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <PriceText row={r} className="text-xl font-semibold text-ink" />
          <div className="text-[11px] text-muted">{PERIOD_LABEL[period]} change</div>
        </div>
        <Sparkline values={r.spark} width={130} height={46} animate={false} />
      </div>
      <div className="mt-3">
        <RangeBar pos={r.rangePos} lo={r.lo52} hi={r.hi52} unit={r.unit} compact />
      </div>
    </Link>
  );
}
