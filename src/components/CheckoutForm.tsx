"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { contentId, useCart } from "@/components/CartProvider";
import { useQuote } from "@/components/useQuote";
import { track } from "@/components/pixel";
import { IconBank, IconShield, IconTruck } from "@/components/icons";
import { naira } from "@/lib/site";
import { LAGOS_DELIVERY_AREAS, OFFICE_PICKUP_DESTINATIONS } from "@/lib/delivery-rates";

type Errors = Record<string, string>;
type AppliedCoupon = { code: string; discountAmount: number; eligibleSubtotal: number };

export default function CheckoutForm({ states }: { states: string[] }) {
  const { lines, ready, clear } = useCart();
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const { quote, loading } = useQuote(state, city);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const [diffWa, setDiffWa] = useState(false);
  const router = useRouter();
  const tracked = useRef(false);
  const placed = useRef(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponPreview, setCouponPreview] = useState<AppliedCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponCartKey, setCouponCartKey] = useState("");
  const cartKey = JSON.stringify(lines.map((l) => [l.variantId, l.qty]));
  useEffect(() => {
    // Any cart change invalidates a previously checked coupon; the customer must check it again.
    setCouponPreview(null); setCouponCartKey(""); setCouponMessage("");
  }, [cartKey]);
  const clientKey = useRef("");
  if (!clientKey.current && typeof window !== "undefined") clientKey.current = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0").slice(0, 40);

  useEffect(() => {
    if (ready && lines.length && !tracked.current) {
      tracked.current = true;
      track("InitiateCheckout", { currency: "NGN", value: lines.reduce((s, l) => s + l.price * l.qty, 0), num_items: lines.length, content_ids: lines.map(contentId), content_type: "product" });
    }
  }, [ready, lines]);

  // Reserve the same height while the saved cart loads and when it is empty, so the page does not jump (layout shift).
  if (!ready) return <div className="container-x min-h-[70vh] py-8 sm:py-12" aria-busy="true"><h1 className="text-3xl sm:text-4xl">Checkout</h1><p className="mt-6 text-neutral-500">Loading your cart…</p></div>;
  if (!lines.length && !placed.current) {
    return (
      <div className="container-x min-h-[70vh] py-20 text-center">
        <h1 className="text-3xl">Your cart is empty</h1>
        <Link href="/shop" className="btn btn-primary mt-6">Shop products</Link>
      </div>
    );
  }

  const unavailable = quote?.lines.filter((l) => !l.available) || [];
  const delivery = state && quote?.delivery && quote.delivery.state === state ? quote.delivery : null;
  const missing = quote ? lines.length - quote.lines.length : 0;
  const activeCoupon = couponCartKey === cartKey ? couponPreview : null;
  const discount = activeCoupon?.discountAmount || 0;
  const payNow = quote ? Math.max(0, quote.subtotal - discount) : 0;
  const deliveryFee = delivery?.available ? (state === "Office Pickup" ? delivery.fee : payNow >= 50000 ? 0 : delivery.baseFee) : null;
  const deliveryBlocked = !!state && !!delivery && (!delivery.available || (payNow < 50000 && delivery.baseFee == null));
  const deliveryMessage = delivery?.message || (payNow < 50000 && delivery?.baseFee == null ? `Delivery fee for ${state} is not configured. Please contact us on WhatsApp.` : "");
  const orderTotal = quote ? payNow + (deliveryFee ?? 0) : 0;

  async function applyCoupon() {
    setCouponMessage(""); setCouponPreview(null); setCouponBusy(true);
    const phone = (document.getElementById("phone") as HTMLInputElement | null)?.value || "";
    try {
      const r = await fetch("/api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponInput, phone, items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })) }) });
      const result = await r.json().catch(() => ({}));
      if (r.ok && result.code) { setCouponPreview(result); setCouponCartKey(cartKey); setCouponInput(result.code); setCouponMessage(`Coupon applied. You save ${naira(result.discountAmount)} on eligible products.`); }
      else setCouponMessage(result.error || "We could not check that coupon.");
    } catch { setCouponMessage("We could not check the coupon. Check your connection and try again."); }
    setCouponBusy(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFail(""); setErrors({});
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"), phone: fd.get("phone"), whatsapp: diffWa ? fd.get("whatsapp") : "", email: fd.get("email"),
      state: fd.get("state"), city: fd.get("city"), address: fd.get("address"), instructions: fd.get("instructions"), company: fd.get("company"),
      items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      clientKey: clientKey.current,
      couponCode: activeCoupon?.code || "",
    };
    const local: Errors = {};
    if (String(body.name || "").trim().length < 2) local.name = "Enter your full name.";
    if (!/^\d{10,13}$/.test(String(body.phone || "").replace(/\D/g, ""))) local.phone = "Enter your phone number, for example 0803 123 4567.";
    if (!body.state) local.state = "Choose your state.";
    else if (deliveryBlocked) local.state = deliveryMessage;
    if (String(body.city || "").trim().length < 2) local.city = "Enter your city or local government area.";
    if (state !== "Office Pickup" && String(body.address || "").trim().length < 8) local.address = "Enter your full delivery address.";
    if (Object.keys(local).length) { setErrors(local); focusFirst(local); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.number) {
        placed.current = true;
        clear();
        window.location.assign(`/order/${j.number}?t=${encodeURIComponent(j.token)}&new=1`);
        return;
      }
      if (j.errors) { setErrors(j.errors); if (j.errors.coupon) { setCouponMessage(j.errors.coupon); setCouponPreview(null); } focusFirst(j.errors); }
      setFail(j.error || (j.errors?.items ? j.errors.items : "Check the highlighted fields."));
    } catch {
      setFail("We could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}) => {
    const { hint, ...rest } = props;
    return (
      <div>
        <label htmlFor={id} className="label">{label}</label>
        <input id={id} name={id} className={`field ${errors[id] ? "border-red-500" : ""}`} aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
        {hint && !errors[id] ? <p id={`${id}-h`} className="hint">{hint}</p> : null}
        {errors[id] ? <p id={`${id}-e`} className="err">{errors[id]}</p> : null}
      </div>
    );
  };

  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl">Checkout</h1>
      <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-neutral-500" aria-label="Checkout steps">
        <li className="text-brand-700">1. Your details</li><li>2. Bank transfer</li><li>3. Confirm payment</li>
      </ol>
      <form onSubmit={submit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          <section className="card p-5 sm:p-6" aria-labelledby="c-h">
            <h2 id="c-h" className="text-xl">Contact details</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">{field("name", "Full name", { autoComplete: "name", required: true })}</div>
              {field("phone", "Phone number", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "0803 123 4567", required: true, hint: "We call or WhatsApp this number about your order." })}
              {field("email", "Email address (optional)", { type: "email", autoComplete: "email", inputMode: "email" })}
              <div className="sm:col-span-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[15px]">
                  <input type="checkbox" checked={diffWa} onChange={(e) => setDiffWa(e.target.checked)} className="h-5 w-5 accent-brand-700" />
                  My WhatsApp number is different
                </label>
                {diffWa ? <div className="mt-3">{field("whatsapp", "WhatsApp number", { type: "tel", inputMode: "tel", placeholder: "0803 123 4567" })}</div> : null}
              </div>
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="d-h">
            <h2 id="d-h" className="text-xl">Delivery or pickup</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="state" className="label">State</label>
                <select id="state" name="state" value={state} onChange={(e) => { setState(e.target.value); setCity(""); setErrors((er) => ({ ...er, state: "" })); }} className={`field ${errors.state ? "border-red-500" : ""}`} aria-invalid={!!errors.state} autoComplete="address-level1">
                  <option value="">Choose your state</option><option value="Office Pickup">Office Pickup</option>
                  {states.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.state ? <p className="err" role="alert">{errors.state}</p> : deliveryBlocked ? <p className="err" role="alert">{deliveryMessage}</p> : delivery?.available ? (
                  <p className="hint">Delivery to {state}: {payNow >= 50000 ? <strong className="text-brand-700">FREE (₦50,000+ orders)</strong> : <strong>{delivery.baseFee != null ? naira(delivery.baseFee) : "Fee not configured"}</strong>}{delivery.eta ? ` · ${delivery.eta}` : ""}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="city" className="label">Area / city</label>
                {state === "Office Pickup" ? (\n                  <select id="city" name="city" value={city} onChange={(e) => { setCity(e.target.value); setErrors((er) => ({ ...er, city: "" })); }} className={`field ${errors.city ? "border-red-500" : ""}`} aria-invalid={!!errors.city}>\n                    <option value="">Select pickup destination</option>\n                    {OFFICE_PICKUP_DESTINATIONS.map((place) => <option key={place} value={place}>{place.replace(/\\b\\w/g, (letter) => letter.toUpperCase())}</option>)}\n                  </select>\n                ) : state === "Lagos" ? (
                  <select id="city" name="city" value={city} onChange={(e) => { setCity(e.target.value); setErrors((er) => ({ ...er, city: "" })); }} className={`field ${errors.city ? "border-red-500" : ""}`} aria-invalid={!!errors.city}>
                    <option value="">Select your Lagos area</option>
                    {LAGOS_DELIVERY_AREAS.map((area) => <option key={area} value={area}>{area.replace(/\\b\\w/g, (letter) => letter.toUpperCase())}</option>)}
                  </select>
                ) : (
                  <input id="city" name="city" value={city} onChange={(e) => { setCity(e.target.value); setErrors((er) => ({ ...er, city: "" })); }} className={`field ${errors.city ? "border-red-500" : ""}`} autoComplete="address-level2" aria-invalid={!!errors.city} placeholder="Enter city or local area" />
                )}
                {errors.city ? <p className="err">{errors.city}</p> : state === "Office Pickup" ? <p className="hint">Select a pickup city. Pickup takes 3–7 working days for parcels up to 4 kg. Extra charges may apply for weight or bulky items.</p> : state === "Lagos" ? <p className="hint">Choose your area to calculate the delivery fee.</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="address" className="label">{state === "Office Pickup" ? "Address (optional)" : "Full delivery address"}</label>
                <textarea id="address" name="address" rows={3} autoComplete="street-address" className={`field ${errors.address ? "border-red-500" : ""}`} aria-invalid={!!errors.address} placeholder={state === "Office Pickup" ? "Optional" : "House number, street, area, nearest landmark"} />
                {errors.address ? <p className="err">{errors.address}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="instructions" className="label">Delivery instructions (optional)</label>
                <textarea id="instructions" name="instructions" rows={2} className="field" placeholder="For example: call before delivery" />
              </div>
            </div>
            <div className="hidden" aria-hidden="true"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="p-h">
            <h2 id="p-h" className="text-xl">Payment</h2>
            <div className="mt-4 flex gap-4 rounded-xl border-2 border-brand-700 bg-brand-50 p-4">
              <IconBank className="h-6 w-6 shrink-0 text-brand-700" />
              <div>
                <p className="font-semibold">Bank transfer</p>
                <p className="mt-1 text-[15px] text-neutral-700">After you place your order, we show you our bank details and the exact amount to transfer. We process your order after we confirm your payment.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-28">
          <section className="card p-5 sm:p-6" aria-labelledby="s-h">
            <h2 id="s-h" className="text-xl">Your order</h2>
            <div className="mt-4 flex gap-2">
              <label htmlFor="couponCode" className="sr-only">Coupon code</label>
              <input id="couponCode" value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponPreview(null); setCouponMessage(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (couponInput.trim()) applyCoupon(); } }} placeholder="Coupon code (optional)" className="field min-w-0 flex-1 uppercase" maxLength={40} autoComplete="off" />
              <button type="button" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} className="btn btn-outline shrink-0 px-4">{couponBusy ? "Checking…" : "Apply"}</button>
            </div>
            {couponMessage ? <p className={`mt-2 text-sm ${activeCoupon ? "text-brand-800" : "text-red-700"}`} role="status">{couponMessage}</p> : null}
            <ul className="mt-4 divide-y divide-neutral-100">
              {lines.map((l) => {
                const s = quote?.lines.find((x) => x.variantId === l.variantId);
                return (
                  <li key={l.variantId} className="flex gap-3 py-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">{l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-contain" /> : null}<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">{l.qty}</span></div>
                    <div className="min-w-0 flex-1 text-[15px]"><p className="font-semibold leading-snug">{l.name}</p><p className="text-neutral-500">{l.label}</p>{s && !s.available ? <p className="err">{s.reason}</p> : null}</div>
                    <span className="font-semibold">{naira((s?.unitPrice ?? l.price) * l.qty)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-neutral-200 pt-4 text-[15px]">
              <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd className="font-semibold">{quote ? naira(quote.subtotal) : "…"}</dd></div>
              {activeCoupon ? <div className="flex justify-between gap-4"><dt className="text-neutral-600">Coupon ({activeCoupon.code})</dt><dd className="font-semibold text-brand-800">−{naira(discount)}</dd></div> : null}
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">{state === "Office Pickup" ? "Pickup fee" : `Delivery fee${state ? ` (${state})` : ""}`}</dt>
                <dd className="text-right">{deliveryBlocked ? <span className="font-medium text-red-700">Fee unavailable</span> : deliveryFee === 0 ? <span className="font-bold text-brand-700">FREE</span> : deliveryFee != null ? naira(deliveryFee) : "Choose state"}</dd>
              </div>
              {delivery?.available && delivery.eta ? <div className="flex justify-between gap-4"><dt className="text-neutral-600">Delivery time</dt><dd className="text-right">{delivery.eta}</dd></div> : null}
              <div className="flex justify-between gap-4"><dt className="text-neutral-600">Total delivery charge</dt><dd className="text-right font-semibold">{deliveryBlocked ? "Fee unavailable" : deliveryFee != null ? naira(deliveryFee) : "…"}</dd></div>
              <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg"><dt className="font-bold">Total to pay</dt><dd className="font-bold">{quote ? naira(orderTotal) : "…"}</dd></div>
            </dl>
            <p className="mt-4 flex gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"><IconTruck className="h-5 w-5 shrink-0" /> <span><strong>{payNow >= 50000 ? "Enjoy FREE DELIVERY on this order." : "Add products to reach ₦50,000 and get FREE DELIVERY."}</strong> Delivery or pickup charges depend on your selected location.</span></p>
            {unavailable.length || missing > 0 ? <p className="err mt-3">Some items are not available. <Link href="/cart" className="underline">Update your cart</Link>.</p> : null}
            {fail ? <p className="err mt-3" role="alert">{fail}</p> : null}
            <button type="submit" disabled={busy || !quote || unavailable.length > 0 || missing > 0 || deliveryBlocked} className="btn btn-primary mt-5 w-full text-base">
              {busy ? "Placing your order..." : "Place order"}
            </button>
            <p className="mt-3 flex gap-2 text-sm text-neutral-500"><IconShield className="h-4 w-4 shrink-0" /> No payment is taken on this page. You pay by bank transfer on the next page.</p>
          </section>
        </aside>
      </form>
    </div>
  );
}

function focusFirst(errs: Record<string, string>) {
  const id = ["name", "phone", "whatsapp", "email", "state", "city", "address"].find((k) => errs[k]);
  if (id) setTimeout(() => document.getElementById(id)?.focus(), 30);
}
