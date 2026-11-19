import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { DELIVERY_PAYMENT_STATUS, FULFILMENT_STATUS, PAYMENT_STATUS, naira } from "@/lib/site";

export const metadata = { title: "Orders" };
const PAY_FILTERS = [["", "All"], ["awaiting_verification", "Awaiting verification"], ["pending_payment", "Pending payment"], ["awaiting_fee", "Need delivery fee (old orders)"], ["paid", "Paid"], ["to_dispatch", "Paid, not dispatched"], ["payment_failed", "Payment failed"]];

export default async function Orders({ searchParams }: { searchParams: { payment?: string; fulfilment?: string; q?: string; page?: string } }) {
  await requirePerm("orders");
  const page = Math.max(1, Number(searchParams.page) || 1);
  const payment = PAY_FILTERS.some(([k]) => k === searchParams.payment) ? searchParams.payment : "";
  const fulfilment = Object.keys(FULFILMENT_STATUS).includes(searchParams.fulfilment || "") ? searchParams.fulfilment : "";
  const q = (searchParams.q || "").slice(0, 60);
  const { rows, count } = listOrders({ payment, fulfilment, q, limit: 50, offset: (page - 1) * 50 });
  const link = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ payment, fulfilment, q, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders${u.toString() ? "?" + u : ""}`;
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Orders <span className="text-base font-normal text-neutral-500">({count})</span></h1>
        <a href="/api/admin/export" className="admin-btn-ghost">Export all to CSV</a>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {PAY_FILTERS.map(([k, l]) => <Link key={k} href={link({ payment: k, page: "" })} className={`rounded-full border px-3 py-1.5 text-sm ${payment === k ? "border-brand-700 bg-brand-700 text-white" : "border-neutral-300 bg-white"}`}>{l}</Link>)}
      </div>
      <form className="mt-3 flex flex-wrap gap-2" action="/admin/orders">
        {payment ? <input type="hidden" name="payment" value={payment} /> : null}
        <input name="q" defaultValue={q} placeholder="Search order number, name, phone, reference" className="admin-input max-w-md" />
        <select name="fulfilment" defaultValue={fulfilment} className="admin-input w-auto">
          <option value="">Any fulfilment</option>
          {Object.entries(FULFILMENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="admin-btn">Filter</button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">State</th><th className="p-3">Product subtotal</th><th className="p-3">Product payment</th><th className="p-3">Delivery payment</th><th className="p-3">Fulfilment</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.number}</Link></td>
                <td className="whitespace-nowrap p-3 text-neutral-500">{o.created_at}</td>
                <td className="p-3">{o.customer_name}<br /><span className="text-neutral-500">{o.phone}</span></td>
                <td className="p-3">{o.state}</td>
                <td className="whitespace-nowrap p-3">{naira(o.subtotal)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.payment_status === "paid" ? "bg-brand-50 text-brand-900" : o.payment_status === "awaiting_verification" ? "bg-amber-100 text-amber-900" : o.payment_status === "payment_failed" ? "bg-red-50 text-red-800" : "bg-neutral-100"}`}>{PAYMENT_STATUS[o.payment_status]}</span></td>
                <td className="p-3">{o.delivery_payment_status === "not_required" ? "Free" : o.delivery_fee == null ? "To be confirmed" : naira(o.delivery_fee)}<br /><span className="text-xs text-neutral-500">{DELIVERY_PAYMENT_STATUS[String(o.delivery_payment_status)]}</span></td>
                <td className="p-3">{FULFILMENT_STATUS[o.fulfilment_status]}</td>
              </tr>
            )) : <tr><td colSpan={8} className="p-6 text-neutral-500">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      {count > 50 ? (
        <div className="mt-4 flex gap-2">
          {page > 1 ? <Link href={link({ page: String(page - 1) })} className="admin-btn-ghost">Previous</Link> : null}
          {page * 50 < count ? <Link href={link({ page: String(page + 1) })} className="admin-btn-ghost">Next</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
