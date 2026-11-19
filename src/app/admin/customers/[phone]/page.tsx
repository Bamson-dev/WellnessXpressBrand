import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { getCustomer } from "@/lib/customers";
import { saveCustomerNoteAction } from "@/app/admin/actions";
import { DELIVERY_PAYMENT_STATUS, FULFILMENT_STATUS, PAYMENT_STATUS, displayPhone, naira } from "@/lib/site";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Customer" };

export default async function CustomerPage(
  props: { params: Promise<{ phone: string }>; searchParams: Promise<{ msg?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requirePerm("customers");
  const c = getCustomer(params.phone);
  if (!c) notFound();
  const s = c.stats!;
  const card = (k: string, v: string | number) => <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">{k}</p><p className="mt-1 text-xl font-bold">{v}</p></div>;
  return (
    <div>
      <Link href="/admin/customers" className="text-sm font-semibold text-brand-700">← Customers</Link>
      <h1 className="mt-2 text-2xl">{String(c.latest.customer_name)}</h1>
      <p className="text-sm text-neutral-500">Customer since {String(s.first_order).slice(0, 10)} · last order {String(s.last_order).slice(0, 10)}</p>
      <div className="mt-3"><Flash msg={searchParams.msg} /></div>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
        {card("Orders", Number(s.orders))}{card("Paid orders", Number(s.paid_orders))}{card("Confirmed payments", naira(Number(s.confirmed)))}{card("Outstanding", naira(Number(s.outstanding)))}{card("Cancelled", Number(s.orders) - Number(s.active_orders))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Order history</h2>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-neutral-500"><tr><th className="py-2">Order</th><th>Date</th><th className="text-right">Products</th><th>Delivery</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>{c.orders.map((o) => (
                <tr key={String(o.id)} className="border-t border-neutral-100">
                  <td className="py-2"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 underline">{String(o.number)}</Link>{o.coupon_code ? <span className="block text-xs text-neutral-500">Coupon {String(o.coupon_code)}</span> : null}</td>
                  <td>{String(o.created_at).slice(0, 10)}</td><td className="text-right">{naira(Number(o.subtotal))}</td>
                  <td>{o.delivery_payment_status === "not_required" ? "Free" : o.delivery_fee == null ? "To be confirmed" : `${naira(Number(o.delivery_fee))} · ${DELIVERY_PAYMENT_STATUS[String(o.delivery_payment_status)] || ""}`}</td>
                  <td>{PAYMENT_STATUS[String(o.payment_status)]}</td><td>{FULFILMENT_STATUS[String(o.fulfilment_status)]}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Activity</h2>
            <ol className="mt-3 space-y-2 text-sm">{c.activity.map((e, i) => <li key={i} className="border-l-2 border-brand-100 pl-3"><span className="text-neutral-500">{String(e.at)} · {String(e.number)}</span><br />{String(e.action).replace(/_/g, " ")}{e.note ? `: ${String(e.note)}` : ""} <span className="text-neutral-500">({String(e.actor)})</span></li>)}</ol>
            {c.reviews.length ? <><h3 className="mt-4 font-semibold">Reviews</h3><ul className="mt-1 text-sm">{c.reviews.map((r, i) => <li key={i}>{String(r.name)}: {Number(r.rating)}/5 · {String(r.status)} · {String(r.created_at).slice(0, 10)}</li>)}</ul></> : null}
          </section>
        </div>
        <div className="space-y-5">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Contact</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div><dt className="inline text-neutral-500">Phone: </dt><dd className="inline"><a href={`tel:+${c.phone}`} className="text-brand-700">{displayPhone(c.phone)}</a></dd></div>
              <div><dt className="inline text-neutral-500">WhatsApp: </dt><dd className="inline">{c.latest.whatsapp ? displayPhone(String(c.latest.whatsapp)) : "Same as phone"}</dd></div>
              <div><dt className="inline text-neutral-500">Email: </dt><dd className="inline">{String(c.latest.email || "—")}</dd></div>
              <div><dt className="inline text-neutral-500">State: </dt><dd className="inline">{String(c.latest.state)}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Delivery addresses used</h3>
            <ul className="mt-1 space-y-1 text-sm">{c.addresses.map((ad, i) => <li key={i}>{String(ad.address)}, {String(ad.city)}, {String(ad.state)}</li>)}</ul>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Customer notes</h2>
            <form action={saveCustomerNoteAction} className="mt-2 space-y-2">
              <input type="hidden" name="phone" value={c.phone} />
              <textarea name="note" defaultValue={String(c.note?.note || "")} rows={5} maxLength={4000} aria-label="Customer notes" className="admin-input" />
              <button className="admin-btn-ghost">Save notes</button>
            </form>
            {c.note ? <p className="mt-1 text-xs text-neutral-500">Last edited {String(c.note.updated_at)} by {String(c.note.updated_by)}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
