import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { INVOICE_STATUS, invoiceFor, listInvoices } from "@/lib/invoices";
import { naira } from "@/lib/site";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Invoices" };

export default async function Invoices({ searchParams }: { searchParams: { q?: string; status?: string; page?: string; msg?: string } }) {
  await requirePerm("invoices");
  const q = (searchParams.q || "").trim().slice(0, 80);
  const status = ["paid", "unpaid", "cancelled"].includes(searchParams.status || "") ? searchParams.status : "";
  const { rows, total, page, pages } = listInvoices({ q, status, page: Number(searchParams.page) || 1 });
  const qs = (p: number) => `/admin/invoices?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) })}`;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Invoices</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">An invoice is created when a payment is verified, when you open an order&apos;s invoice, or when the customer downloads it. Amounts always come from the order. &quot;Paid&quot; appears only after an admin verifies the payment.</p>
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/invoices">
        <input name="q" defaultValue={q} placeholder="Invoice, order, customer or phone" aria-label="Search invoices" className="admin-input max-w-sm" />
        <select name="status" defaultValue={status} aria-label="Status" className="admin-input w-auto"><option value="">All</option><option value="paid">Paid</option><option value="unpaid">Not paid</option><option value="cancelled">Cancelled</option></select>
        <button className="admin-btn">Search</button>
      </form>
      <p className="mt-3 text-sm text-neutral-500">{total} invoice{total === 1 ? "" : "s"}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Invoice</th><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3">Issued</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => {
              const inv = invoiceFor(Number(r.order_id));
              return (
                <tr key={String(r.number)} className="border-t border-neutral-100">
                  <td className="p-3 font-semibold"><Link href={`/admin/invoices/${r.order_id}`} className="text-brand-700 underline">{String(r.number)}</Link></td>
                  <td className="p-3"><Link href={`/admin/orders/${r.order_id}`} className="underline">{String(r.order_number)}</Link></td>
                  <td className="p-3">{String(r.customer_name)}</td>
                  <td className="p-3 text-right">{inv ? naira(inv.total) : "—"}</td>
                  <td className="p-3">{inv ? INVOICE_STATUS[inv.status] : "—"}</td>
                  <td className="p-3 text-neutral-500">{String(r.created_at).slice(0, 10)}</td>
                  <td className="p-3"><a href={`/api/admin/invoices/${r.order_id}`} className="text-brand-700 underline">PDF</a></td>
                </tr>
              );
            }) : <tr><td colSpan={7} className="p-4 text-neutral-500">No invoices match.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 ? <nav className="mt-3 flex gap-2 text-sm" aria-label="Pages">{page > 1 ? <Link href={qs(page - 1)} className="admin-btn-ghost">Previous</Link> : null}<span className="self-center">Page {page} of {pages}</span>{page < pages ? <Link href={qs(page + 1)} className="admin-btn-ghost">Next</Link> : null}</nav> : null}
    </div>
  );
}
