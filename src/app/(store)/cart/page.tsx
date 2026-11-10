"use client";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { naira } from "@/lib/site";

export default function CartPage() {
  const { lines, subtotal, setQty, remove, ready } = useCart();
  if (!ready) return <div className="container-x py-16"><p>Loading your cart...</p></div>;
  if (!lines.length)
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-4xl">Your cart is empty</h1>
        <p className="mt-3 text-ink/70">Add products from the shop to get started.</p>
        <Link href="/shop" className="btn btn-primary mt-8">Go to shop</Link>
      </div>
    );
  return (
    <div className="container-x py-12">
      <h1 className="text-4xl">Your cart</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <ul className="divide-y divide-sage-100 rounded-2xl bg-white lg:col-span-2">
          {lines.map((l) => (
            <li key={l.sku} className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <Link href={`/product/${l.slug}`} className="font-semibold hover:text-sage-600">{l.name}</Link>
                <p className="text-sm text-ink/70">{naira(l.price)} each</p>
              </div>
              <label className="sr-only" htmlFor={`q-${l.sku}`}>Quantity for {l.name}</label>
              <input id={`q-${l.sku}`} type="number" min={1} max={20} value={l.qty} onChange={(e) => setQty(l.sku, Number(e.target.value))} className="field w-20 !py-2" />
              <p className="w-28 text-right font-semibold">{naira(l.price * l.qty)}</p>
              <button onClick={() => remove(l.sku)} className="text-sm text-red-700 underline" aria-label={`Remove ${l.name}`}>Remove</button>
            </li>
          ))}
        </ul>
        <aside className="h-fit rounded-2xl bg-white p-6">
          <h2 className="text-2xl">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold">{naira(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd>Confirmed after you order</dd></div>
          </dl>
          <Link href="/checkout" className="btn btn-primary mt-6 w-full">Go to checkout</Link>
          <p className="mt-3 text-xs text-ink/60">Final prices and availability are checked again when you submit.</p>
        </aside>
      </div>
    </div>
  );
}
