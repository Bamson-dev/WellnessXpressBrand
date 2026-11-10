"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCart } from "@/components/CartProvider";
import { naira } from "@/lib/site";

type Errs = Record<string, string>;
const fields: [string, string, string, string][] = [
  ["name", "Full name", "text", "name"], ["email", "Email", "email", "email"], ["phone", "Phone number", "tel", "tel"],
  ["address", "Delivery address", "text", "street-address"], ["city", "City", "text", "address-level2"], ["state", "State", "text", "address-level1"],
];

export default function Checkout() {
  const { lines, subtotal, clear, ready } = useCart();
  const [errors, setErrors] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [fail, setFail] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setFail(""); setErrors({});
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    body.items = lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    try {
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { if (j.errors) setErrors(j.errors); else setFail(j.error || "Something went wrong."); }
      else { setDone({ reference: j.reference }); clear(); }
    } catch { setFail("Network error. Check your connection and try again."); }
    setBusy(false);
  }

  if (done)
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-4xl">Order request received</h1>
        <p className="mt-4">Your reference is <strong>{done.reference}</strong>.</p>
        <p className="mx-auto mt-3 max-w-xl text-ink/75">No payment has been taken. Online payment is not enabled yet, so the team will contact you to confirm payment and delivery.</p>
        <Link href="/shop" className="btn btn-primary mt-8">Continue shopping</Link>
      </div>
    );
  if (!ready) return <div className="container-x py-16"><p>Loading...</p></div>;
  if (!lines.length)
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-4xl">Nothing to check out</h1>
        <Link href="/shop" className="btn btn-primary mt-8">Go to shop</Link>
      </div>
    );

  return (
    <div className="container-x py-12">
      <h1 className="text-4xl">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <form onSubmit={submit} className="space-y-5 rounded-2xl bg-white p-6 lg:col-span-2" noValidate>
          {fields.map(([n, label, type, ac]) => (
            <div key={n}>
              <label htmlFor={n} className="label">{label}</label>
              <input id={n} name={n} type={type} autoComplete={ac} required className="field" aria-invalid={!!errors[n]} aria-describedby={errors[n] ? `${n}-e` : undefined} />
              {errors[n] && <p id={`${n}-e`} className="err">{errors[n]}</p>}
            </div>
          ))}
          <div>
            <label htmlFor="notes" className="label">Delivery notes (optional)</label>
            <textarea id="notes" name="notes" rows={3} maxLength={500} className="field" />
          </div>
          {errors.items && <p className="err" role="alert">{errors.items}</p>}
          {fail && <p className="err" role="alert">{fail}</p>}
          <div className="rounded-xl bg-sage-50 p-4 text-sm">
            <p className="font-semibold">Payment</p>
            <p className="mt-1 text-ink/75">Online payment is not enabled yet. Submitting sends an order request. No money is taken on this site.</p>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending..." : "Send order request"}</button>
        </form>
        <aside className="h-fit rounded-2xl bg-white p-6">
          <h2 className="text-2xl">Summary</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {lines.map((l) => (<li key={l.sku} className="flex justify-between gap-3"><span>{l.name} x {l.qty}</span><span>{naira(l.price * l.qty)}</span></li>))}
          </ul>
          <p className="mt-4 flex justify-between border-t border-sage-100 pt-4 font-semibold"><span>Subtotal</span><span>{naira(subtotal)}</span></p>
          <p className="mt-2 text-xs text-ink/60">Delivery cost is confirmed by the team.</p>
        </aside>
      </div>
    </div>
  );
}
