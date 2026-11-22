import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getOrderForCustomer, orderItems } from "@/lib/orders";
import { bankIsComplete, getBank, getContact } from "@/lib/settings";
import { naira, orderStatusLabel } from "@/lib/site";
import CopyButton from "@/components/CopyButton";
import PaymentConfirmForm from "@/components/PaymentConfirmForm";
import { IconCheck, IconInfo, IconTruck, IconWhatsApp } from "@/components/icons";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default async function OrderPage(
  props: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; new?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const token = searchParams.t || (await cookies()).get(`wx_ot_${params.number}`)?.value || "";
  const o = getOrderForCustomer(params.number, token);
  const contact = getContact();
  if (!o) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-3xl">Order not found</h1>
        <p className="mx-auto mt-3 max-w-md text-neutral-600">Open the order link we gave you after checkout. If you lost it, message us on WhatsApp with your order number.</p>
        {contact.whatsapp ? <a href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I need help finding my order.")}`} className="btn btn-wa mt-6" target="_blank" rel="noopener noreferrer"><IconWhatsApp /> Message us on WhatsApp</a> : null}
      </div>
    );
  }
  const items = orderItems(o.id);
  const itemsSubtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const discountAmount = Number(o.discount_amount || 0);
  // Orders placed under the free delivery policy. Older orders keep their own delivery fee and payment record.
  const bundledDelivery = o.delivery_fee_source === "included_in_order";
  const freeDelivery = !bundledDelivery && (o.delivery_fee_source === "free_delivery" || o.delivery_payment_status === "not_required");
  const bank = getBank();
  const status = orderStatusLabel(o);
  const isNew = searchParams.new === "1";
  const canPay = ["pending_payment", "payment_failed"].includes(o.payment_status) && o.fulfilment_status !== "cancelled";
  const submitted = o.payment_status === "awaiting_verification";
  const wa = (m: string) => (contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(m)}` : null);
  const help = wa(`Hello WellnessXpressBrand. I need help with my order ${o.number}.`);
  const receiptWa = wa(`Hello WellnessXpressBrand. I have paid for the products in order ${o.number}. Amount: ${naira(o.total ?? (o.subtotal + (o.delivery_fee || 0)))}. Here is my payment receipt.`);

  return (
    <div className="container-x max-w-4xl py-8 sm:py-12">
      {isNew ? (
        <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white"><IconCheck className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl">Thank you. We have received your order.</h1>
            <p className="mt-1 text-neutral-700">This page is saved on this phone or computer. Bookmark it to come back and check your order. Keep your order number for WhatsApp support.</p>
          </div>
        </div>
      ) : <h1 className="text-3xl">Your order</h1>}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-neutral-500">Order number</p><p className="mt-1 flex items-center gap-2 text-lg font-bold">{o.number}<CopyButton text={o.number} label="Copy order number" small /></p></div>
        <div className="card p-4"><p className="text-sm text-neutral-500">Status</p><p className="mt-1 text-lg font-bold text-brand-700">{status}</p></div>
        <div className="card p-4"><p className="text-sm text-neutral-500">{bundledDelivery ? "Total payment" : "Product payment"}</p><p className="mt-1 text-lg font-bold">{naira(bundledDelivery ? (o.total ?? o.subtotal) : o.subtotal)}</p></div>
      </div>

      {o.fulfilment_status !== "cancelled" && bundledDelivery ? (
        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-6">
          <IconTruck className="h-6 w-6 shrink-0 text-brand-700" />
          <div><h2 className="text-xl text-brand-900">Delivery included in your payment</h2><p className="mt-1 text-neutral-700">Delivery to {o.state}: <strong>{naira(o.delivery_fee || 0)}</strong>. Pay the total shown below to WellnessXpressBrand. We handle payment to the delivery agent.{o.delivery_eta ? ` Estimated delivery time: ${String(o.delivery_eta)}.` : ""}</p></div>
        </section>
      ) : o.fulfilment_status !== "cancelled" && freeDelivery ? (
        <section className="mt-6 flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-6">
          <IconTruck className="h-6 w-6 shrink-0 text-brand-700" />
          <div>
            <h2 className="text-xl text-brand-900">Free delivery to {o.state}</h2>
            <p className="mt-1 text-neutral-700">Delivery charge: ₦0. You pay only for your products.{o.delivery_eta ? ` Estimated delivery time: ${String(o.delivery_eta)}.` : ""}</p>
            {o.dispatched_at || o.tracking_reference ? <p className="mt-2 text-neutral-700">Dispatched{o.dispatched_at ? ` on ${String(o.dispatched_at).slice(0, 10)}` : ""}{o.courier ? ` with ${String(o.courier)}` : ""}.{o.tracking_reference ? <> Tracking reference: <strong>{String(o.tracking_reference)}</strong></> : null}</p> : null}
          </div>
        </section>
      ) : o.fulfilment_status !== "cancelled" ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-xl text-amber-950"><IconInfo className="h-6 w-6" /> Delivery is paid separately</h2>
          {o.delivery_fee == null ? (
            <p className="mt-2 text-amber-950">Your delivery fee will be confirmed separately. You can pay for your products now. We will contact you with the delivery charge.</p>
          ) : o.delivery_payment_status === "paid" ? (
            <p className="mt-2 text-amber-950">Delivery to {o.state}: <strong>{naira(o.delivery_fee)}</strong>. {o.delivery_fee > 0 ? "Your delivery payment is confirmed." : "No delivery fee for this order."}</p>
          ) : (
            <p className="mt-2 text-amber-950">Delivery to {o.state}: <strong>{naira(o.delivery_fee)}</strong>{o.delivery_eta ? ` (${String(o.delivery_eta)})` : ""}. This is a separate payment from your products. Do not add it to your product transfer. We will send you the delivery payment details before dispatch.</p>
          )}
        </section>
      ) : null}

      {canPay ? (
        <section className="mt-6 rounded-2xl border-2 border-brand-700 bg-white p-5 shadow-card sm:p-6" aria-labelledby="pay-h">
          <h2 id="pay-h" className="text-xl sm:text-2xl">Pay by bank transfer</h2>
          {o.payment_status === "payment_failed" ? <p className="mt-2 rounded-lg bg-red-50 p-3 text-red-800">We could not confirm your last payment. Check the amount and account, then send a new confirmation, or message us on WhatsApp.</p> : null}
          <p className="mt-2 text-neutral-700">Please transfer the exact amount below.{bundledDelivery ? " Delivery is included in this total. We handle the delivery agent payment." : freeDelivery ? " Delivery is free." : " Delivery is paid separately."}</p>
          {bankIsComplete(bank) ? (
            <dl className="mt-5 divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-[16px]">
              <div className="flex items-center justify-between gap-3 p-4"><dt className="text-neutral-600">{bundledDelivery ? "Total payment" : "Product payment"}</dt><dd className="flex items-center gap-2 text-xl font-bold">{naira(bundledDelivery ? (o.total ?? (o.subtotal + (o.delivery_fee || 0))) : o.subtotal)}<CopyButton text={String(bundledDelivery ? (o.total ?? o.subtotal) : o.subtotal)} label="Copy amount" small /></dd></div>
              <div className="flex items-center justify-between gap-3 p-4"><dt className="text-neutral-600">Bank</dt><dd className="font-semibold">{bank.bank}</dd></div>
              <div className="flex items-center justify-between gap-3 p-4"><dt className="text-neutral-600">Account name</dt><dd className="text-right font-semibold">{bank.accountName}</dd></div>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-50 p-4"><dt className="text-neutral-600">Account number</dt><dd className="flex items-center gap-3"><span className="text-2xl font-bold tracking-wider tabular-nums">{bank.accountNumber}</span><CopyButton text={bank.accountNumber} label="Copy account number" /></dd></div>
              <div className="flex items-center justify-between gap-3 p-4"><dt className="text-neutral-600">Narration</dt><dd className="font-semibold">{o.number}</dd></div>
            </dl>
          ) : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">Our bank details are being updated. Message us on WhatsApp for payment details.</p>}
          <p className="mt-4 text-neutral-700">After you transfer, submit your payment confirmation below. We check our bank account before we confirm your payment.</p>
          <PaymentConfirmForm number={o.number} token={token} />
          {receiptWa ? <a href={receiptWa} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 font-semibold text-[#12703a] hover:underline"><IconWhatsApp /> Or send your receipt on WhatsApp</a> : null}
        </section>
      ) : null}

      {submitted ? (
        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-6">
          <h2 className="text-xl">Payment confirmation received</h2>
          <p className="mt-2 text-neutral-700">Thank you. We are checking our bank account for your transfer. Your order will be processed after we verify your payment. We will contact you if we need anything.</p>
        </section>
      ) : null}
      {o.payment_status === "paid" ? (
        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-5 sm:p-6">
          <h2 className="text-xl">Payment confirmed</h2>
          <p className="mt-2 text-neutral-700">We have confirmed your payment. Current status: <strong>{status}</strong>.</p>
        </section>
      ) : null}

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-xl">Order summary</h2>
        <ul className="mt-3 divide-y divide-neutral-100">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3 text-[15px]"><span><strong>{i.qty} ×</strong> {i.name} <span className="text-neutral-500">({i.variant_label})</span></span><span className="font-semibold">{naira(i.line_total)}</span></li>
          ))}
        </ul>
        <dl className="mt-2 space-y-2 border-t border-neutral-200 pt-3 text-[15px]">
          <div className="flex justify-between"><dt className="text-neutral-600">Product subtotal</dt><dd>{naira(itemsSubtotal)}</dd></div>
          {discountAmount ? <div className="flex justify-between gap-4"><dt className="text-neutral-600">Coupon{o.coupon_code ? ` (${String(o.coupon_code)})` : ""}</dt><dd>−{naira(discountAmount)}</dd></div> : null}
          {discountAmount ? <div className="flex justify-between gap-4"><dt className="text-neutral-600">Product payment after discount</dt><dd>{naira(o.subtotal)}</dd></div> : null}
          {bundledDelivery ? (
            <>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Delivery ({o.state})</dt><dd>{naira(o.delivery_fee || 0)} · Included</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Payment status</dt><dd>{o.payment_status === "paid" ? "Confirmed" : o.payment_status === "awaiting_verification" ? "Being verified" : "Not paid yet"}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Total to pay WellnessXpressBrand</dt><dd>{naira(o.total)}</dd></div>
            </>
          ) : freeDelivery ? (
            <>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Delivery ({o.state})</dt><dd className="font-bold text-brand-700">FREE</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Product payment</dt><dd>{o.payment_status === "paid" ? "Confirmed" : o.payment_status === "awaiting_verification" ? "Being verified" : "Not paid yet"}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{naira(o.subtotal)}</dd></div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Delivery ({o.state})</dt><dd>{o.delivery_fee != null ? naira(o.delivery_fee) : "To be confirmed"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Delivery payment</dt><dd>{o.delivery_fee == null ? "Not set yet" : o.delivery_payment_status === "paid" ? (o.delivery_fee > 0 ? "Paid" : "Not needed") : "Not paid yet (separate)"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Product payment</dt><dd>{o.payment_status === "paid" ? "Confirmed" : o.payment_status === "awaiting_verification" ? "Being verified" : "Not paid yet"}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Order total</dt><dd>{naira(o.subtotal + (o.delivery_fee || 0))}</dd></div>
            </>
          )}
        </dl>
        <div className="mt-5 rounded-xl bg-neutral-50 p-4 text-[15px]">
          <p className="font-semibold">Delivering to</p>
          <p className="mt-1 text-neutral-700">{o.customer_name}, {o.address}, {o.city}, {o.state}</p>
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {help ? <a href={help} target="_blank" rel="noopener noreferrer" className="btn btn-wa"><IconWhatsApp /> WhatsApp support</a> : null}
        <a href={`/order/${o.number}/invoice${searchParams.t ? `?t=${encodeURIComponent(searchParams.t)}` : ""}`} className="btn btn-outline">Download invoice (PDF)</a>
        <Link href="/shop" className="btn btn-outline">Continue shopping</Link>
      </div>
    </div>
  );
}
