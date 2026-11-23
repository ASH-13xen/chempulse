"use client";

import { Info } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";

/** The small (i) button. Click or press Enter for a plain-English explanation. */
export function InfoTip({ title, children, side = "bottom", className = "" }: { title?: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={title ? `What is ${title}?` : "More information"}
          data-noexport="true"
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent-ink ${className}`}
        >
          <Info className="size-3.5" strokeWidth={2.2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side={side} sideOffset={8} collisionPadding={12} className="pop w-[300px] p-4 text-sm leading-relaxed">
          {title && <div className="mb-1.5 font-semibold text-ink">{title}</div>}
          <div className="space-y-2 text-ink-2">{children}</div>
          <Popover.Arrow className="fill-[var(--surface)]" width={12} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
