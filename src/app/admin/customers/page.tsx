import Link from "next/link";
import { can, requirePerm } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { displayPhone, naira } from "@/lib/site";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: { q?: string; sort?: string; page?: string } }) {
  const a = await requirePerm("customers");
  const q = (searchParams.q || "").trim().slice(0, 80);
  const sort = ["spend", "orders", "outstanding"].includes(searchParams.sort || "") ? searchParams.sort! : "";
  const { rows, total, page, pages } = listCustomers({ q, sort, page: Number(searchParams.page) || 1 });
  const qs = (p: number) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(sort ? { sort } : {}), page: String(p) })}`;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Customers</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">Built from orders and grouped by phone number. &quot;Confirmed&quot; counts only payments an admin verified. Unpaid orders show as outstanding.</p>
        </div>
        {can(a, "reports") ? <a href="/api/admin/customers-export" className="admin-btn-ghost">Export CSV</a> : null}
      </div>
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/customers">
        <input name="q" defaultValue={q} placeholder="Name, email or phone" aria-label="Search customers" className="admin-input max-w-sm" />
        <select name="sort" defaultValue={sort} aria-label="Sort" className="admin-input w-auto"><option value="">Latest order</option><option value="spend">Confirmed spending</option><option value="orders">Number of orders</option><option value="outstanding">Outstanding</option></select>
        <button className="admin-btn">Search</button>
      </form>
      <p className="mt-3 text-sm text-neutral-500">{total} customer{total === 1 ? "" : "s"}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Email</th><th className="p-3">State</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Confirmed</th><th className="p-3 text-right">Outstanding</th><th className="p-3">Last order</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={String(r.phone)} className="border-t border-neutral-100">
                <td className="p-3"><Link href={`/admin/customers/${r.phone}`} className="font-semibold text-brand-700 underline">{String(r.name)}</Link></td>
                <td className="p-3">{displayPhone(String(r.phone))}</td><td className="p-3">{String(r.email || "—")}</td><td className="p-3">{String(r.state)}</td>
                <td className="p-3 text-right">{Number(r.orders)}</td><td className="p-3 text-right">{naira(Number(r.confirmed))}</td><td className="p-3 text-right">{naira(Number(r.outstanding))}</td>
                <td className="p-3 text-neutral-500">{String(r.last_order).slice(0, 10)}</td>
              </tr>
            )) : <tr><td colSpan={8} className="p-4 text-neutral-500">No customers match.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 ? <nav className="mt-3 flex gap-2 text-sm" aria-label="Pages">{page > 1 ? <Link href={qs(page - 1)} className="admin-btn-ghost">Previous</Link> : null}<span className="self-center">Page {page} of {pages}</span>{page < pages ? <Link href={qs(page + 1)} className="admin-btn-ghost">Next</Link> : null}</nav> : null}
    </div>
  );
}
