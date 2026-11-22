import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePerm } from "@/lib/auth";
import { bankOf, getOrderById, orderEvents, orderItems } from "@/lib/orders";
import { getContact } from "@/lib/settings";
import { DELIVERY_PAYMENT_STATUS, FULFILMENT_STATUS, PAYMENT_STATUS, displayPhone, naira } from "@/lib/site";
import Flash from "@/components/admin/Flash";
import { markDeliveryPaidAction, saveDispatchAction, markPaymentFailedAction, saveNotesAction, setDeliveryFeeAction, setFulfilmentAction, unverifyPaymentAction, verifyPaymentAction } from "@/app/admin/actions";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Order" };

export default async function OrderDetail(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const a = await requirePerm("orders");
  const o = getOrderById(Number(params.id));
  if (!o) notFound();
  const items = orderItems(o.id);
  const events = orderEvents(o.id);
  const bank = bankOf(o);
  const contact = getContact();
  const waNumber = o.whatsapp || o.phone;
  const waMsg = (m: string) => `https://wa.me/${waNumber}?text=${encodeURIComponent(m)}`;
  const storeName = "WellnessXpressBrand";
  const bundledDelivery = o.delivery_fee_source === "included_in_order";
  const freeDelivery = !bundledDelivery && (o.delivery_fee_source === "free_delivery" || o.delivery_payment_status === "not_required");
  const feeMsg = o.delivery_fee != null && !freeDelivery && !bundledDelivery ? waMsg(`Hello ${o.customer_name}. This is ${storeName}. The delivery fee for your order ${o.number} is ${naira(o.delivery_fee)}. Please pay the delivery fee separately and reply with your transfer confirmation. Thank you.`) : null;
  const paidMsg = waMsg(`Hello ${o.customer_name}. This is ${storeName}. We have confirmed your payment for order ${o.number}. We will update you when it is on the way. Thank you.`);
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-neutral-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

  return (
    <div>
      <Link href="/admin/orders" className="text-sm font-semibold text-brand-700">← Orders</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{o.number}</h1>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">{PAYMENT_STATUS[o.payment_status]}</span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">{FULFILMENT_STATUS[o.fulfilment_status]}</span>
        {can(a, "invoices") ? <span className="ml-auto flex gap-2"><Link href={`/admin/invoices/${o.id}`} className="admin-btn-ghost">Invoice</Link><a href={`/api/admin/invoices/${o.id}`} className="admin-btn-ghost">PDF</a></span> : null}
      </div>
      <p className="text-sm text-neutral-500">Placed {o.created_at} (UTC)</p>
      <div className="mt-4"><Flash msg={searchParams.msg} /></div>

      <div className="mt-2 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {o.delivery_fee == null && !freeDelivery && !bundledDelivery && o.fulfilment_status !== "cancelled" ? (
            <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
              <h2 className="text-lg">Set the delivery fee</h2>
              <p className="mt-1 text-sm text-amber-900">Delivery fee is included in the customer payment. You handle settlement with the delivery agent.</p>
              <AdminForm action={setDeliveryFeeAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={o.id} />
                <input name="fee" inputMode="numeric" placeholder="Delivery fee in ₦" className="admin-input w-48" required />
                <button className="admin-btn">Save fee</button>
              </AdminForm>
            </section>
          ) : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Items</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-neutral-500"><tr><th className="py-2">Product</th><th>SKU</th><th className="text-right">Price</th><th className="text-right">Qty</th><th className="text-right">Total</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id} className="border-t border-neutral-100"><td className="py-2">{i.name} <span className="text-neutral-500">({i.variant_label})</span></td><td className="text-neutral-500">{i.sku}</td><td className="text-right">{naira(i.unit_price)}</td><td className="text-right">{i.qty}</td><td className="text-right font-semibold">{naira(i.line_total)}</td></tr>
              ))}</tbody>
            </table>
            <dl className="mt-3 border-t border-neutral-200 pt-2 text-sm">
              {row("Product subtotal", naira(items.reduce((sum, item) => sum + item.line_total, 0)))}
              {Number(o.discount_amount || 0) ? row(`Coupon (${String(o.coupon_code || "")})`, `−${naira(Number(o.discount_amount))}`) : null}
              {Number(o.discount_amount || 0) ? row("Product payment after discount", naira(o.subtotal)) : null}
              {row(`Delivery (${o.state})`, bundledDelivery ? <span>{naira(o.delivery_fee || 0)} · Included</span> : freeDelivery ? <span className="font-bold text-brand-700">FREE</span> : o.delivery_fee != null ? naira(o.delivery_fee) : <span className="text-amber-700">Not set</span>)}
              {row("Customer total", <span className="text-lg">{o.total != null ? naira(o.total) : "To be confirmed"}</span>)}
            </dl>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Payment</h2>
            <dl className="mt-2 text-sm">
              {row("Method", "Bank transfer")}
              {row("Customer's payer name", o.payer_name || "—")}
              {row("Customer's reference", o.payment_reference || "—")}
              {row("Customer's note", o.payment_note || "—")}
              {row("Confirmation sent", o.payment_submitted_at || "—")}
              {row("Receipt", o.receipt_path ? <a href={`/api/admin/receipt/${o.id}`} target="_blank" rel="noopener" className="text-brand-700 underline">Open receipt</a> : "None uploaded")}
              {row("Pay into", `${bank.bank} · ${bank.accountNumber} · ${bank.accountName}`)}
              {row("Verified", o.paid_at ? `${o.paid_at} by ${o.verified_by}` : "Not verified")}
              {o.purchase_event_status ? row("Meta Purchase event", String(o.purchase_event_status)) : null}
            </dl>
            {!can(a, "payments") ? (
              <p className="mt-3 text-xs text-neutral-500">You can view this order. Payment verification needs the Payment verification permission.</p>
            ) : o.payment_status !== "paid" ? (
              <div className="mt-4 rounded-lg bg-neutral-50 p-4">
                <p className="text-sm font-semibold">Check your {bank.bank} account for the full customer payment of {naira(bundledDelivery ? (o.total ?? o.subtotal) : o.subtotal)} before you confirm.</p>
                <p className="mt-1 text-xs text-neutral-500">A receipt or reference from the customer is not proof of payment. Confirm only when you see the money in the account.</p>
                <AdminForm action={verifyPaymentAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={o.id} />
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" className="mt-0.5 h-4 w-4 accent-brand-700" required /> I have seen {naira(bundledDelivery ? (o.total ?? o.subtotal) : o.subtotal)} arrive for this order.</label>
                  <input name="note" placeholder="Note (optional), for example bank reference" className="admin-input" />
                  <button className="admin-btn">Confirm product payment</button>
                </AdminForm>
                {o.payment_status !== "payment_failed" ? (
                  <AdminForm action={markPaymentFailedAction} className="mt-3 flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="note" placeholder="Reason (optional)" className="admin-input max-w-xs" />
                    <button className="admin-btn-danger">Mark payment failed</button>
                  </AdminForm>
                ) : null}
              </div>
            ) : a.role === "owner" ? (
              <AdminForm action={unverifyPaymentAction} className="mt-4 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={o.id} />
                <input name="note" placeholder="Reason" className="admin-input max-w-xs" required />
                <button className="admin-btn-danger">Undo payment confirmation</button>
              </AdminForm>
            ) : null}
          </section>

          {freeDelivery || bundledDelivery ? (
            <section className="rounded-xl border border-brand-100 bg-brand-50 p-5">
              <h2 className="text-lg">Delivery</h2>
              <dl className="mt-2 text-sm">
                {row("Delivery charge", bundledDelivery ? <span>{naira(o.delivery_fee || 0)} · Included in order payment</span> : <span className="font-bold text-brand-700">FREE (₦0)</span>)}
                {row("Delivery payment", bundledDelivery ? "Included in customer payment. Settle delivery agent yourself." : "Not required")}
                {row("Estimated time", String(o.delivery_eta || "Not set"))}
                {row("Dispatched", o.dispatched_at ? String(o.dispatched_at) : "Not yet")}
              </dl>
              {bundledDelivery && o.payment_status !== "paid" && o.fulfilment_status !== "cancelled" ? (
                <AdminForm action={setDeliveryFeeAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={o.id} />
                  <label htmlFor="bundledfee" className="text-neutral-600">Change delivery fee</label>
                  <input id="bundledfee" name="fee" inputMode="numeric" defaultValue={o.delivery_fee ?? ""} className="admin-input w-32" required />
                  <button className="admin-btn-ghost">Update fee</button>
                </AdminForm>
              ) : null}
              <AdminForm action={saveDispatchAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="id" value={o.id} />
                <label className="text-xs font-semibold text-neutral-600">Courier or rider<input name="courier" defaultValue={String(o.courier || "")} maxLength={80} className="admin-input mt-1" /></label>
                <label className="text-xs font-semibold text-neutral-600">Tracking reference<input name="tracking" defaultValue={String(o.tracking_reference || "")} maxLength={80} className="admin-input mt-1" /></label>
                <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Dispatch note (internal)<input name="dispatchNote" defaultValue={String(o.dispatch_note || "")} maxLength={300} className="admin-input mt-1" /></label>
                <button className="admin-btn w-fit">Save dispatch details</button>
              </AdminForm>
              <p className="mt-2 text-xs text-neutral-500">The customer sees the courier and tracking reference on their order page.</p>
            </section>
          ) : null}

          {!freeDelivery && !bundledDelivery ? <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Delivery payment (older order)</h2>
            <p className="mt-1 text-xs text-neutral-500">Saving the delivery fee below includes it in the order total, so the customer pays one amount to the store.</p>
            <dl className="mt-2 text-sm">
              {row("Delivery fee", o.delivery_fee == null ? "Not set" : naira(o.delivery_fee))}
              {row("Status", DELIVERY_PAYMENT_STATUS[String(o.delivery_payment_status)] || String(o.delivery_payment_status))}
              {row("Reference", String(o.delivery_payment_reference || "—"))}
              {row("Confirmed", String(o.delivery_paid_at || "Not confirmed"))}
              {row("Fee source", o.delivery_fee_source === "state_settings" ? `Delivery settings for ${o.state} at checkout${o.delivery_eta ? ` · ${String(o.delivery_eta)}` : ""}` : o.delivery_fee_source === "admin" ? "Set by admin on this order" : "—")}
            </dl>
            {o.delivery_fee != null && o.delivery_payment_status !== "paid" && o.fulfilment_status !== "cancelled" ? (
              <AdminForm action={setDeliveryFeeAction} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="id" value={o.id} />
                <label htmlFor="newfee" className="text-neutral-600">Change fee for this order</label>
                <input id="newfee" name="fee" inputMode="numeric" defaultValue={o.delivery_fee} className="admin-input w-32" required />
                <button className="admin-btn-ghost">Update fee</button>
              </AdminForm>
            ) : null}
            {o.delivery_fee != null && o.delivery_payment_status !== "paid" ? (
              <AdminForm action={markDeliveryPaidAction} className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-4">
                <input type="hidden" name="id" value={o.id} />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" className="mt-0.5 h-4 w-4 accent-brand-700" required /> I have seen {naira(o.delivery_fee)} arrive for delivery.</label>
                <input name="reference" placeholder="Delivery payment reference (optional)" className="admin-input" />
                <button className="admin-btn">Confirm delivery payment</button>
              </AdminForm>
            ) : null}
          </section> : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Fulfilment</h2>
            <AdminForm action={setFulfilmentAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={o.id} />
              <select name="status" defaultValue={o.fulfilment_status} className="admin-input w-auto">
                {Object.entries(FULFILMENT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input name="note" placeholder="Note (optional), for example rider name" className="admin-input max-w-xs" />
              <button className="admin-btn">Update status</button>
            </AdminForm>
            <p className="mt-2 text-xs text-neutral-500">Processing, Shipped and Delivered need a confirmed payment. Cancelling puts tracked stock back.</p>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Admin notes</h2>
            <AdminForm action={saveNotesAction} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <textarea name="notes" defaultValue={o.admin_notes} rows={4} className="admin-input" />
              <button className="admin-btn-ghost">Save notes</button>
            </AdminForm>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Customer</h2>
            <dl className="mt-2 text-sm">
              {row("Name", o.customer_name)}
              {row("Phone", <a href={`tel:+${o.phone}`} className="text-brand-700">{displayPhone(o.phone)}</a>)}
              {row("WhatsApp", o.whatsapp ? displayPhone(o.whatsapp) : "Same as phone")}
              {row("Email", o.email || "—")}
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Delivery address</h3>
            <p className="mt-1 text-sm">{o.address}<br />{o.city}, {o.state}</p>
            {o.instructions ? <p className="mt-2 rounded bg-neutral-50 p-2 text-sm">Instructions: {o.instructions}</p> : null}
            <div className="mt-4 grid gap-2">
              {feeMsg && o.delivery_payment_status !== "paid" ? <a href={feeMsg} target="_blank" rel="noopener noreferrer" className="admin-btn bg-[#1FA855] hover:bg-[#178a45]">WhatsApp: request delivery fee</a> : null}
              {o.payment_status === "paid" ? <a href={paidMsg} target="_blank" rel="noopener noreferrer" className="admin-btn bg-[#1FA855] hover:bg-[#178a45]">WhatsApp: payment confirmed</a> : null}
              <a href={waMsg(`Hello ${o.customer_name}. This is ${storeName} about your order ${o.number}.`)} target="_blank" rel="noopener noreferrer" className="admin-btn-ghost">Open WhatsApp chat</a>
            </div>
            <p className="mt-2 text-xs text-neutral-500">These buttons open WhatsApp with a message ready. Nothing is sent until you press send in WhatsApp. Store number: {displayPhone(contact.whatsapp)}</p>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">History</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {events.map((e, i) => (
                <li key={i} className="border-l-2 border-brand-100 pl-3">
                  <p className="font-medium">{e.action.replace(/_/g, " ")}</p>
                  <p className="text-xs text-neutral-500">{e.at} · {e.actor}</p>
                  {e.note ? <p className="text-neutral-700">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
