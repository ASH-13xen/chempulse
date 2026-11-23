"use client";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function csvCell(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  // BOM so Excel opens ₹ and other symbols correctly
  save(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }), filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/** Renders a DOM node (a card, a chart) to a PNG and downloads it. */
export async function downloadPng(node: HTMLElement, filename: string) {
  const { toPng } = await import("html-to-image");
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
  node.dataset.exporting = "true";
  try {
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: bg,
      cacheBust: true,
      filter: (el) => !(el instanceof HTMLElement && el.dataset?.noexport === "true"),
    });
    const blob = await (await fetch(dataUrl)).blob();
    save(blob, filename.endsWith(".png") ? filename : `${filename}.png`);
  } finally {
    delete node.dataset.exporting;
  }
}

export async function copyPng(node: HTMLElement) {
  const { toBlob } = await import("html-to-image");
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor: bg,
    filter: (el) => !(el instanceof HTMLElement && el.dataset?.noexport === "true"),
  });
  if (blob && navigator.clipboard && "ClipboardItem" in window) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  }
  return false;
}
