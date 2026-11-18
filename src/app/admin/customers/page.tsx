import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone, naira } from "@/lib/site";

export const metadata = { title: "Customers" };

export default async function Customers() {
  await requireAdmin();
  const rows = db().prepare(
    `SELECT phone, MAX(customer_name) name, MAX(email) email, MAX(state) state, COUNT(*) orders,
     SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END) paid, MAX(created_at) last, MAX(id) last_id
     FROM orders GROUP BY phone ORDER BY last DESC LIMIT 500`
  ).all();
  return (
    <div>
      <h1 className="text-2xl">Customers</h1>
      <p className="mt-1 text-sm text-neutral-600">Built from orders, grouped by phone number. Customers do not need accounts.</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Email</th><th className="p-3">State</th><th className="p-3">Orders</th><th className="p-3">Paid total</th><th className="p-3">Last order</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={String(r.phone)} className="border-t border-neutral-100">
                <td className="p-3">{String(r.name)}</td><td className="p-3">{displayPhone(String(r.phone))}</td><td className="p-3">{String(r.email || "—")}</td><td className="p-3">{String(r.state)}</td>
                <td className="p-3"><Link href={`/admin/orders?q=${r.phone}`} className="text-brand-700 underline">{Number(r.orders)}</Link></td>
                <td className="p-3">{naira(Number(r.paid || 0))}</td><td className="p-3 text-neutral-500">{String(r.last)}</td>
              </tr>
            )) : <tr><td colSpan={7} className="p-4 text-neutral-500">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
