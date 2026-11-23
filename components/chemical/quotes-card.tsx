"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { Chemical, Quote } from "@/lib/types";
import { Card, Empty } from "../ui/card";

const CITIES = ["Chennai", "Mumbai", "Ahmedabad", "Delhi NCR", "Kolkata", "Hyderabad", "Bengaluru", "Other"];

/**
 * Quotes the client hears from suppliers. Stored in MongoDB, converted to ₹/kg
 * (litres use the chemical's density) and compared with the import price.
 */
export function QuotesCard({ chem, quotes: serverQuotes, storage, lastPrice }: { chem: Chemical; quotes: Quote[]; storage: "mongo" | "json"; lastPrice: number | null }) {
  const router = useRouter();
  // Show changes instantly; the server copy catches up on refresh.
  const [added, setAdded] = useState<Quote[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const quotes = [...added.filter((a) => !serverQuotes.some((q) => q.id === a.id)), ...serverQuotes]
    .filter((q) => !removed.has(q.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const [form, setForm] = useState({ date: "", city: "Chennai", supplier: "", grade: "", price: "", unit: "kg" as Quote["unit"], note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const enabled = storage === "mongo";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default the date to today on the client
    setForm((f) => (f.date ? f : { ...f, date: new Date().toISOString().slice(0, 10) }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const price = Number(form.price);
    if (!(price > 0)) return setErr("Enter a price above zero.");
    setBusy(true);
    const res = await fetch("/api/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, price, chem: chem.id }) });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(body.error ?? "Could not save the quote.");
    if (body.quote) setAdded((a) => [body.quote as Quote, ...a]);
    setForm((f) => ({ ...f, supplier: "", grade: "", price: "", note: "" }));
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this quote?")) return;
    const res = await fetch(`/api/quotes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setRemoved((r) => new Set(r).add(id));
    router.refresh();
  }

  return (
    <Card
      title="Your supplier quotes"
      subtitle="Prices you hear from suppliers and brokers, by city"
      info={
        <>
          <p>Add quotes as you receive them (WhatsApp, calls, emails). They are converted to ₹/kg so you can compare cities and suppliers with the India import price.</p>
          <p>Litre prices are converted with the chemical&apos;s density{chem.density ? ` (${chem.density} kg/L)` : ""}.</p>
        </>
      }
      png={false}
      csv={() => ({ header: ["Date", "City", "Supplier", "Grade", "Price", "Unit", "Rs/kg", "Note"], rows: quotes.map((q) => [q.date, q.city, q.supplier, q.grade, q.price, q.unit, q.pricePerKg?.toFixed(2) ?? "", q.note]) })}
      exportName={`${chem.id}-quotes`}
    >
      {!enabled && (
        <div className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-[0.8125rem] text-ink-2">
          Saving quotes needs the MongoDB database. This preview is running on local snapshot files, so the form is switched off.
        </div>
      )}
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="Add a quote">
        <label className="col-span-1 text-xs text-ink-2">
          Date
          <input type="date" className="input mt-1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} disabled={!enabled} required />
        </label>
        <label className="text-xs text-ink-2">
          City
          <select className="input mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!enabled}>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2 xl:col-span-2">
          Supplier
          <input className="input mt-1" value={form.supplier} placeholder="e.g. ABC Traders" onChange={(e) => setForm({ ...form, supplier: e.target.value })} disabled={!enabled} maxLength={80} />
        </label>
        <label className="text-xs text-ink-2">
          Grade / pack
          <input className="input mt-1" value={form.grade} placeholder="99%, 200 L drum" onChange={(e) => setForm({ ...form, grade: e.target.value })} disabled={!enabled} maxLength={60} />
        </label>
        <label className="text-xs text-ink-2">
          Price (₹)
          <input className="input mt-1" inputMode="decimal" value={form.price} placeholder="0.00" onChange={(e) => setForm({ ...form, price: e.target.value })} disabled={!enabled} required />
        </label>
        <label className="text-xs text-ink-2">
          Per
          <select className="input mt-1" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Quote["unit"] })} disabled={!enabled}>
            <option value="kg">kg</option>
            <option value="L" disabled={!chem.density}>
              litre{chem.density ? "" : " (no density)"}
            </option>
            <option value="t">tonne</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full justify-center" disabled={!enabled || busy}>
            <Plus className="size-4" /> {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {err && <p className="col-span-full text-[0.8125rem] text-down-ink">{err}</p>}
      </form>

      <div className="mt-5">
        {quotes.length === 0 ? (
          <Empty title="No quotes yet">Add the next price you are offered. Over time this builds your own Chennai vs Mumbai price history.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tnum w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">City</th>
                  <th className="py-2 pr-4 font-medium">Supplier</th>
                  <th className="py-2 pr-4 font-medium">Grade</th>
                  <th className="py-2 pr-4 text-right font-medium">Quoted</th>
                  <th className="py-2 pr-4 text-right font-medium">₹/kg</th>
                  <th className="py-2 pr-4 text-right font-medium">vs import price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-line/60">
                    <td className="py-2 pr-4">{fmtDate(q.date, "long")}</td>
                    <td className="py-2 pr-4">{q.city}</td>
                    <td className="py-2 pr-4">{q.supplier || "—"}</td>
                    <td className="py-2 pr-4 text-ink-2">{q.grade || "—"}</td>
                    <td className="py-2 pr-4 text-right">
                      ₹{fmtNum(q.price)}/{q.unit}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium text-ink">{q.pricePerKg == null ? "–" : `₹${fmtNum(q.pricePerKg)}`}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">{q.pricePerKg != null && lastPrice ? fmtPct((q.pricePerKg / lastPrice - 1) * 100) : "–"}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => remove(q.id)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-down-ink" aria-label="Delete quote">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
