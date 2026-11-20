"use client";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/CartProvider";
import { useQuote } from "@/components/useQuote";
import QtyControl from "@/components/QtyControl";
import { IconCart, IconTrash } from "@/components/icons";
import { naira } from "@/lib/site";

export default function CartPage() {
  const { lines, setQty, remove, ready } = useCart();
  const { quote } = useQuote();
  const q = (id: number) => quote?.lines.find((l) => l.variantId === id);
  const blocked = quote?.lines.some((l) => !l.available) || (quote && quote.lines.length < lines.length);

  // Same reserved height while the saved cart loads and when it is empty, so the page does not jump (layout shift).
  if (!ready) return <div className="container-x min-h-[70vh] py-8 sm:py-12" aria-busy="true"><h1 className="text-3xl sm:text-4xl">Your cart</h1><p className="mt-6 text-neutral-500">Loading your cart…</p></div>;
  if (!lines.length) {
    return (
      <div className="container-x flex min-h-[70vh] flex-col items-center py-20 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-700"><IconCart className="h-8 w-8" /></span>
        <h1 className="mt-4 text-3xl">Your cart is empty</h1>
        <p className="mt-2 text-neutral-600">Add products to your cart to place an order.</p>
        <Link href="/shop" className="btn btn-primary mt-6">Shop products</Link>
      </div>
    );
  }
  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl">Your cart</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="min-w-0 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {lines.map((l) => {
            const s = q(l.variantId);
            return (
              <li key={l.variantId} className="flex gap-3 p-3 sm:gap-4 sm:p-5">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50 sm:h-24 sm:w-24">{l.image ? <Image src={l.image} alt="" fill sizes="96px" className="object-contain" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/product/${l.slug}`} className="text-[17px] font-semibold hover:text-brand-700">{l.name}</Link>
                      <p className="text-sm text-neutral-500">{l.label} · {naira(s?.unitPrice ?? l.price)} each</p>
                    </div>
                    <button onClick={() => remove(l.variantId)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${l.name}`}><IconTrash className="h-5 w-5" /></button>
                  </div>
                  {s && !s.available ? <p className="err">{s.reason}. Remove it or change the quantity.</p> : null}
                  {quote && !s ? <p className="err">This item is no longer available. Remove it to continue.</p> : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <QtyControl value={l.qty} onChange={(n) => setQty(l.variantId, n)} small label={`Quantity of ${l.name}`} />
                    <span className="text-lg font-bold">{naira((s?.unitPrice ?? l.price) * l.qty)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <aside className="card h-fit min-w-0 p-6 lg:sticky lg:top-28">
          <h2 className="text-xl">Order summary</h2>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between"><dt className="text-neutral-600">Subtotal</dt><dd className="font-semibold">{quote ? naira(quote.subtotal) : "…"}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-600">Delivery</dt><dd className="font-semibold">{quote ? (quote.subtotal >= 50000 ? "FREE" : quote.delivery?.fee != null ? naira(quote.delivery.fee) : "Calculated at checkout") : "…"}</dd></div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg"><dt className="font-bold">Total</dt><dd className="font-bold">{quote ? naira(quote.subtotal + (quote.subtotal >= 50000 ? 0 : Number(quote.delivery?.fee || 0))) : "…"}</dd></div>
          </dl>
          <Link href="/checkout" aria-disabled={!!blocked} className={`btn btn-primary mt-6 w-full text-base ${blocked ? "pointer-events-none opacity-50" : ""}`}>Checkout</Link>
          <Link href="/shop" className="btn btn-outline mt-2 w-full">Continue shopping</Link>
          <p className="mt-4 text-sm font-semibold text-brand-800">Free delivery on orders ₦50,000 and above. Smaller orders pay delivery.</p>
          <p className="mt-1 text-sm text-neutral-500">No account needed. Pay by bank transfer after you place your order.</p>
        </aside>
      </div>
    </div>
  );
}
