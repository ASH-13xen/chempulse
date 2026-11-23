"use client";

import { Check, Copy, Download, FileSpreadsheet, ImageDown, Table2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
import { copyPng, downloadCsv, downloadPng, slug } from "@/lib/download";
import { InfoTip } from "./info-tip";

const today = () => new Date().toISOString().slice(0, 10);

export type CsvData = { header: string[]; rows: unknown[][] };

/**
 * A titled panel. Pass `csv` to offer "Download data", and every card can be
 * saved as a PNG image (charts included). `table` adds a "View as table" toggle.
 */
export function Card({
  title,
  subtitle,
  info,
  infoTitle,
  actions,
  csv,
  exportName,
  table,
  children,
  className = "",
  bodyClassName = "",
  png = true,
  id,
  tour,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  info?: ReactNode;
  infoTitle?: string;
  actions?: ReactNode;
  csv?: () => CsvData;
  exportName?: string;
  table?: () => ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  png?: boolean;
  id?: string;
  tour?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = exportName ?? (typeof title === "string" ? title : "chart");
  const hasMenu = png || csv || table;

  return (
    <section ref={ref} id={id} data-tour={tour} data-reveal className={`card flex flex-col ${className}`}>
      {(title || actions || hasMenu) && (
        <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-ink">
                {title}
                {info && <InfoTip title={infoTitle ?? (typeof title === "string" ? title : undefined)}>{info}</InfoTip>}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-noexport="true">
            {actions}
            {hasMenu && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" aria-label="Download or view options" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                    <Download className="size-4" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="pop min-w-[200px] p-1.5">
                    {png && (
                      <DropdownMenu.Item className="menu-item" onSelect={() => ref.current && downloadPng(ref.current, `${slug(name)}-${today()}.png`)}>
                        <ImageDown className="size-4 text-ink-2" /> Download image (PNG)
                      </DropdownMenu.Item>
                    )}
                    {png && (
                      <DropdownMenu.Item
                        className="menu-item"
                        onSelect={async () => {
                          if (ref.current && (await copyPng(ref.current))) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                          }
                        }}
                      >
                        {copied ? <Check className="size-4 text-up-ink" /> : <Copy className="size-4 text-ink-2" />} Copy image
                      </DropdownMenu.Item>
                    )}
                    {csv && (
                      <DropdownMenu.Item
                        className="menu-item"
                        onSelect={() => {
                          const d = csv();
                          downloadCsv(`${slug(name)}-${today()}.csv`, d.header, d.rows);
                        }}
                      >
                        <FileSpreadsheet className="size-4 text-ink-2" /> Download data (CSV / Excel)
                      </DropdownMenu.Item>
                    )}
                    {table && (
                      <DropdownMenu.Item className="menu-item" onSelect={() => setShowTable((v) => !v)}>
                        <Table2 className="size-4 text-ink-2" /> {showTable ? "Show chart" : "View as table"}
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </header>
      )}
      <div className={`min-w-0 flex-1 px-5 pb-5 ${bodyClassName}`}>{showTable && table ? <div className="max-h-[420px] overflow-auto">{table()}</div> : children}</div>
    </section>
  );
}

/** Simple accessible data table used by "View as table". */
export function DataTable({ header, rows }: { header: string[]; rows: (string | number | null)[][] }) {
  return (
    <table className="tnum w-full text-left text-sm">
      <thead className="sticky top-0 bg-surface text-xs text-muted">
        <tr>
          {header.map((h) => (
            <th key={h} className="border-b border-line py-2 pr-4 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line/60 last:border-0">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-4 whitespace-nowrap text-ink-2">
                {c ?? "–"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatTile({ label, value, sub, info, infoTitle, tone }: { label: string; value: ReactNode; sub?: ReactNode; info?: ReactNode; infoTitle?: string; tone?: "up" | "down" }) {
  return (
    <div data-reveal className="card card-hover relative overflow-hidden p-4">
      <div className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
        {label}
        {info && <InfoTip title={infoTitle ?? label}>{info}</InfoTip>}
      </div>
      <div className={`mt-2 text-[28px] leading-none font-semibold tracking-tight ${tone === "up" ? "text-up-ink" : tone === "down" ? "text-down-ink" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-2 text-[13px] text-ink-2">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] text-ink-2">{children}</div>}
    </div>
  );
}
