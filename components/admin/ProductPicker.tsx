"use client";
import { useMemo, useState } from "react";

type Item = { id: string; label: string; hint?: string };

/** Searchable multi-select. Submits the chosen ids as one comma-separated hidden field (validated on the server). */
export default function ProductPicker({ name, items, initial, label, emptyText }: { name: string; items: Item[]; initial: string[]; label: string; emptyText: string }) {
  const [chosen, setChosen] = useState<string[]>(initial.filter((x) => items.some((i) => i.id === x)));
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <fieldset className="rounded-lg border border-neutral-200 p-3 sm:col-span-2">
      <legend className="px-1 text-xs font-semibold text-neutral-600">{label}</legend>
      <input type="hidden" name={name} value={chosen.join(",")} />
      <div className="flex flex-wrap gap-1" aria-live="polite">
        {chosen.length ? chosen.map((id) => {
          const it = items.find((i) => i.id === id);
          return <button key={id} type="button" onClick={() => toggle(id)} className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900 hover:bg-red-50 hover:text-red-800" aria-label={`Remove ${it?.label}`}>{it?.label} ×</button>;
        }) : <span className="text-xs text-neutral-500">{emptyText}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${label}`} className="admin-input min-w-0 flex-1 py-1" />
        <button type="button" onClick={() => setChosen((c) => [...new Set([...c, ...shown.map((i) => i.id)])])} className="admin-btn-ghost py-1 text-xs">Select shown</button>
        <button type="button" onClick={() => setChosen([])} className="admin-btn-ghost py-1 text-xs">Clear</button>
      </div>
      <ul className="mt-2 max-h-40 overflow-y-auto">
        {shown.map((i) => (
          <li key={i.id}><label className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 accent-brand-700" /> {i.label}{i.hint ? <span className="text-xs text-neutral-500">{i.hint}</span> : null}</label></li>
        ))}
      </ul>
    </fieldset>
  );
}
