import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { ensureInvoice, INVOICE_STATUS, invoiceFor } from "@/lib/invoices";
import { getContact } from "@/lib/settings";
import { displayPhone, naira, site } from "@/lib/site";
import PrintButton from "@/components/admin/PrintButton";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: { orderId: string } }) {
  const a = await requirePerm("invoices");
  const id = Number(params.orderId);
  if (!Number.isSafeInteger(id) || !ensureInvoice(id, a.email)) notFound();
  const inv = invoiceFor(id);
  if (!inv) notFound();
  const c = getContact();
  const o = inv.order;
  const row = (k: string, v: string, strong = false) => <div className={`flex justify-between gap-6 py-1 ${strong ? "text-base font-bold" : ""}`}><dt className={strong ? "" : "text-neutral-600"}>{k}</dt><dd>{v}</dd></div>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/invoices" className="text-sm font-semibold text-brand-700">← Invoices</Link>
        <span className="ml-auto" />
        <PrintButton label="Print invoice" />
        <a href={`/api/admin/invoices/${o.id}`} className="admin-btn">Download PDF</a>
      </div>
      <article className="mx-auto mt-4 max-w-3xl rounded-xl border border-neutral-200 bg-white p-6 text-sm print:border-0 print:p-0 sm:p-10">
        <header className="flex flex-wrap justify-between gap-4">
          <div><p className="text-2xl font-extrabold text-brand-800">{site.name}</p><p className="text-neutral-500">{site.url.replace(/^https?:\/\//, "")}</p>{c.email ? <p className="text-neutral-500">{c.email}</p> : null}{c.whatsapp ? <p className="text-neutral-500">WhatsApp {displayPhone(c.whatsapp)}</p> : null}</div>
          <div className="text-right"><p className="text-2xl font-extrabold">INVOICE</p><p className="font-semibold">{inv.number}</p><p className="text-neutral-500">Issued {inv.createdAt.slice(0, 10)}</p><p className="text-neutral-500">Order {o.number} · {String(o.created_at).slice(0, 10)}</p>
            <p className={`mt-2 inline-block rounded border px-3 py-1 font-bold ${inv.status === "paid" ? "border-brand-700 text-brand-800" : "border-amber-600 text-amber-800"}`}>{INVOICE_STATUS[inv.status].toUpperCase()}</p></div>
        </header>
        <section className="mt-6"><h2 className="font-bold">Bill to</h2><p>{o.customer_name}</p><p className="text-neutral-600">{displayPhone(o.phone)}{o.email ? ` · ${o.email}` : ""}</p><p className="text-neutral-600">{o.address}, {o.city}, {o.state}</p></section>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[480px]">
          <thead className="border-b border-neutral-300 text-left"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>{inv.lines.map((l, i) => <tr key={i} className="border-b border-neutral-100"><td className="py-2">{l.name} <span className="text-neutral-500">({l.label})</span><br /><span className="text-xs text-neutral-500">SKU {l.sku}</span></td><td className="py-2 text-right">{l.qty}</td><td className="py-2 text-right">{naira(l.unitPrice)}</td><td className="py-2 text-right">{naira(l.lineTotal)}</td></tr>)}</tbody>
        </table></div>
        <dl className="ml-auto mt-4 max-w-xs">
          {row("Products subtotal", naira(inv.itemsSubtotal))}
          {inv.discount ? row(`Discount${inv.couponCode ? ` (${inv.couponCode})` : ""}`, `−${naira(inv.discount)}`) : null}
          {row("Delivery", inv.freeDelivery ? "FREE (₦0)" : inv.deliveryFee == null ? "To be confirmed" : naira(inv.deliveryFee))}
          {row("Total", naira(inv.total), true)}
          {row("Amount paid (verified)", naira(inv.amountPaid))}
          {row("Balance due", naira(inv.balance), true)}
        </dl>
        <section className="mt-6 text-neutral-700">
          {o.payment_status === "paid" && inv.productPaidAt ? <p>Product payment verified on {inv.productPaidAt.slice(0, 16)} UTC.</p> : <p>Pay by bank transfer: {inv.bank.bank}, {inv.bank.accountName}, {inv.bank.accountNumber}. Narration: {o.number}.</p>}
          {!inv.freeDelivery && inv.deliveryFee ? <p>{inv.deliveryPaidAt ? `Delivery payment verified on ${inv.deliveryPaidAt.slice(0, 16)} UTC.` : "Delivery fee is payable separately."}</p> : null}
          {inv.freeDelivery ? <p className="font-semibold text-brand-800">Free delivery across Nigeria.</p> : null}
          <p className="mt-4 text-xs text-neutral-500">A payment shows as paid only after it is verified in the bank account.</p>
        </section>
      </article>
    </div>
  );
}
