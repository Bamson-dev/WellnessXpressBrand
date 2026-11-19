import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveStockAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Inventory" };

export default async function Inventory({ searchParams }: { searchParams: { q?: string; stock?: string; msg?: string } }) {
  await requireAdmin("owner");
  const q = (searchParams.q || "").trim().slice(0, 80);
  const stock = searchParams.stock || "all";
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) { where.push("(p.name LIKE ? OR v.sku LIKE ? OR v.label LIKE ?)"); const like = `%${q.replace(/[%_]/g, "")}%`; params.push(like, like, like); }
  if (stock === "tracked") where.push("v.stock IS NOT NULL");
  if (stock === "untracked") where.push("v.stock IS NULL");
  if (stock === "low") where.push("v.stock IS NOT NULL AND v.stock > 0 AND v.low_stock_threshold > 0 AND v.stock <= v.low_stock_threshold");
  if (stock === "out") where.push("v.stock = 0");
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db().prepare(`SELECT v.id,v.product_id,v.label,v.sku,v.stock,v.low_stock_threshold,p.name product_name,p.slug
    FROM variants v JOIN products p ON p.id=v.product_id ${filter} ORDER BY p.name,v.sort,v.id LIMIT 100`).all(...params);
  const movements = db().prepare("SELECT * FROM inventory_movements ORDER BY id DESC LIMIT 40").all();
  return <div>
    <Flash msg={searchParams.msg} />
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl">Inventory</h1><p className="mt-1 text-sm text-neutral-600">Tracked stock is deducted after product payment is verified. Cancelling restores deducted stock. Leave stock unconfigured until you know the opening quantity.</p></div>
      <Link className="admin-btn-ghost" href="/admin/products">Product options</Link>
    </div>
    <form method="get" className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_220px_auto]">
      <input name="q" defaultValue={q} placeholder="Search product, option or SKU" className="admin-input" />
      <select name="stock" defaultValue={stock} className="admin-input"><option value="all">All options</option><option value="tracked">Tracked</option><option value="untracked">Not tracked</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      <button className="admin-btn">Filter</button>
    </form>
    <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm"><thead className="bg-neutral-50 text-neutral-600"><tr><th className="p-3">Product / option</th><th className="p-3">SKU</th><th className="p-3">Current stock</th><th className="p-3">Adjustment</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={String(r.id)} className="border-t border-neutral-100 align-top">
          <td className="p-3"><Link className="font-semibold text-brand-700 hover:underline" href={`/admin/products/${Number(r.product_id)}`}>{String(r.product_name)}</Link><div className="text-neutral-600">{String(r.label)}</div></td>
          <td className="p-3 font-mono text-xs">{String(r.sku)}</td>
          <td className="p-3">{r.stock == null ? <span className="text-neutral-500">Not tracked</span> : <>{Number(r.stock)}{Number(r.stock) === 0 ? <span className="ml-2 text-red-700">Out</span> : Number(r.low_stock_threshold) > 0 && Number(r.stock) <= Number(r.low_stock_threshold) ? <span className="ml-2 text-amber-700">Low</span> : null}</>}</td>
          <td className="min-w-[330px] p-3">
            <form action={saveStockAction} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="variantId" value={Number(r.id)} />
              <label className="text-xs">New quantity<input aria-label={`New quantity for ${r.product_name} ${r.label}`} name="stock" type="number" min="0" max="1000000" step="1" defaultValue={r.stock == null ? "" : Number(r.stock)} placeholder="Opening stock" className="admin-input mt-1" required /></label>
              <label className="text-xs">Low-stock threshold<input aria-label={`Low-stock threshold for ${r.product_name} ${r.label}`} name="threshold" type="number" min="0" max="1000000" step="1" defaultValue={Number(r.low_stock_threshold)} className="admin-input mt-1" required /></label>
              <input name="reason" maxLength={160} placeholder={r.stock == null ? "Opening stock reason" : "Adjustment reason"} className="admin-input col-span-2" required />
              <button className="admin-btn col-span-2">Save stock</button>
            </form>
          </td>
        </tr>)}{rows.length === 0 ? <tr><td colSpan={4} className="p-6 text-neutral-500">No product options match this filter.</td></tr> : null}</tbody>
      </table>
    </div>
    <section className="mt-8">
      <h2 className="text-xl">Recent stock movements</h2><p className="mt-1 text-sm text-neutral-600">Changes are recorded with the product and option names as they were at the time.</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white"><table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600"><tr><th className="p-3">Date</th><th className="p-3">Product / option</th><th className="p-3">Change</th><th className="p-3">Reason</th><th className="p-3">By</th></tr></thead>
        <tbody>{movements.map((m) => <tr key={String(m.id)} className="border-t border-neutral-100"><td className="whitespace-nowrap p-3">{String(m.created_at)}</td><td className="p-3">{String(m.product_name)} · {String(m.variant_label)}<div className="font-mono text-xs text-neutral-500">{String(m.sku)}</div></td><td className="p-3">{Number(m.previous_qty)} → {Number(m.new_qty)} <span className={Number(m.qty_change) < 0 ? "text-red-700" : "text-brand-700"}>({Number(m.qty_change) > 0 ? "+" : ""}{Number(m.qty_change)})</span></td><td className="p-3">{String(m.reason)}</td><td className="p-3">{String(m.actor)}</td></tr>)}{movements.length === 0 ? <tr><td colSpan={5} className="p-6 text-neutral-500">No stock movements recorded yet.</td></tr> : null}</tbody>
      </table></div>
      <p className="mt-2 text-xs text-neutral-500">Showing the latest 40 movements.</p>
    </section>
  </div>;
}
