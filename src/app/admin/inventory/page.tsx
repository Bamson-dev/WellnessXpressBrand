import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { inventoryRows, movements, REASONS } from "@/lib/inventory";
import { adjustStockAction, setThresholdAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Inventory" };
const BADGE: Record<string, string> = { out: "bg-red-50 text-red-800", low: "bg-amber-100 text-amber-900", ok: "bg-brand-50 text-brand-900", untracked: "bg-neutral-100 text-neutral-600" };
const LABEL: Record<string, string> = { out: "Out of stock", low: "Low stock", ok: "In stock", untracked: "Not tracked" };

export default async function Inventory(
  props: { searchParams: Promise<{ q?: string; status?: string; msg?: string; v?: string }> }
) {
  const searchParams = await props.searchParams;
  await requirePerm("inventory");
  const q = (searchParams.q || "").slice(0, 60);
  const status = Object.keys(LABEL).includes(searchParams.status || "") ? searchParams.status : "";
  const rows = inventoryRows({ q, status });
  const vid = Number(searchParams.v) || undefined;
  const hist = movements(vid, 60);
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Inventory</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">Stock is reserved when a customer places an order and released if the order is cancelled. Adding to a cart does not change stock. Every change is recorded below.</p>
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/inventory">
        <input name="q" defaultValue={q} placeholder="Search product, option or SKU" className="admin-input max-w-xs" />
        <select name="status" defaultValue={status} className="admin-input w-auto"><option value="">All</option>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="admin-btn">Filter</button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3">Low-stock level</th><th className="p-3">Change stock</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} className="border-t border-neutral-100 align-top">
                <td className="p-3"><Link href={`/admin/products/${r.productId}`} className="font-semibold text-brand-700 hover:underline">{r.product}</Link><br /><span className="text-neutral-500">{r.label}</span></td>
                <td className="p-3 text-xs text-neutral-500">{r.sku}</td>
                <td className="p-3 text-lg font-bold tabular-nums">{r.stock ?? "—"}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.status]}`}>{LABEL[r.status]}</span><br /><Link href={`/admin/inventory?v=${r.variantId}`} className="text-xs text-brand-700 underline">History</Link></td>
                <td className="p-3">
                  <form action={setThresholdAction} className="flex gap-1"><input type="hidden" name="variantId" value={r.variantId} /><input name="threshold" inputMode="numeric" defaultValue={r.threshold ?? ""} placeholder="—" className="admin-input w-20" aria-label={`Low-stock level for ${r.product} ${r.label}`} /><button className="admin-btn-ghost px-2 py-1">Save</button></form>
                </td>
                <td className="p-3">
                  <form action={adjustStockAction} className="flex flex-wrap gap-1">
                    <input type="hidden" name="variantId" value={r.variantId} />
                    <select name="kind" className="admin-input w-auto" aria-label="Stock action" defaultValue={r.stock == null ? "opening" : "increase"}>
                      {r.stock == null ? <option value="opening">Set opening stock</option> : <><option value="increase">Add received stock</option><option value="decrease">Remove stock</option><option value="correction">Correct count to</option><option value="untrack">Stop tracking</option></>}
                    </select>
                    <input name="qty" inputMode="numeric" placeholder="Qty" className="admin-input w-20" aria-label="Quantity" />
                    <input name="note" placeholder="Reason" className="admin-input w-36" aria-label="Reason" />
                    <button className="admin-btn px-3 py-1.5">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6} className="p-6 text-neutral-500">No products match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg">{vid ? "Stock history for this option" : "Recent stock changes"}</h2>{vid ? <Link href="/admin/inventory" className="text-sm text-brand-700 underline">Show all</Link> : null}</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-2">When</th><th>Product</th><th>Change</th><th>Stock after</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {hist.map((m) => (
                <tr key={String(m.id)} className="border-t border-neutral-100">
                  <td className="py-2 text-neutral-500">{String(m.at)}</td><td>{String(m.pname || "")} <span className="text-neutral-500">{String(m.label || "")}</span></td>
                  <td className={Number(m.delta) < 0 ? "text-red-700" : "text-brand-700"}>{Number(m.delta) > 0 ? "+" : ""}{Number(m.delta)}</td>
                  <td>{m.stock_after == null ? "—" : String(m.stock_after)}</td>
                  <td>{REASONS[String(m.reason)] || String(m.reason)}{m.onumber ? ` · ${m.onumber}` : ""}{m.note && !String(m.note).startsWith("Order ") ? ` · ${m.note}` : ""}</td>
                  <td className="text-neutral-500">{String(m.actor)}</td>
                </tr>
              ))}
              {!hist.length ? <tr><td colSpan={6} className="py-4 text-neutral-500">No stock changes yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
