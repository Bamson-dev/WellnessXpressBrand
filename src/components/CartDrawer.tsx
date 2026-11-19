"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { useCart } from "@/components/CartProvider";
import QtyControl from "@/components/QtyControl";
import { IconCart, IconClose, IconTrash } from "@/components/icons";
import { naira } from "@/lib/site";

export default function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, subtotal, count } = useCart();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your cart">
      <button className="absolute inset-0 bg-black/40" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-5">
          <h2 className="text-lg">Your cart {count ? <span className="text-neutral-500">({count})</span> : null}</h2>
          <button onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-neutral-100" aria-label="Close cart"><IconClose className="h-6 w-6" /></button>
        </div>
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-700"><IconCart className="h-8 w-8" /></span>
            <p className="text-lg font-semibold">Your cart is empty</p>
            <Link href="/shop" onClick={() => setOpen(false)} className="btn btn-primary">Shop products</Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.variantId} className="flex gap-4 py-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                    {l.image ? <Image src={l.image} alt="" fill sizes="80px" className="object-contain p-1" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${l.slug}`} onClick={() => setOpen(false)} className="block font-semibold leading-snug hover:text-brand-700">{l.name}</Link>
                    <p className="text-sm text-neutral-500">{l.label}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QtyControl value={l.qty} onChange={(n) => setQty(l.variantId, n)} small label={`Quantity of ${l.name}`} />
                      <span className="font-semibold">{naira(l.price * l.qty)}</span>
                    </div>
                  </div>
                  <button onClick={() => remove(l.variantId)} className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${l.name}`}><IconTrash className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="border-t border-neutral-200 p-5">
              <div className="flex items-center justify-between text-base"><span className="text-neutral-600">Subtotal</span><span className="text-lg font-bold">{naira(subtotal)}</span></div>
              <p className="mt-1 text-sm font-semibold text-brand-700">Free delivery across Nigeria. No delivery charge.</p>
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn btn-primary mt-4 w-full">Checkout</Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href="/cart" onClick={() => setOpen(false)} className="btn btn-outline w-full">View cart</Link>
                <button onClick={() => setOpen(false)} className="btn w-full border border-neutral-300 text-ink hover:bg-neutral-50">Keep shopping</button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
