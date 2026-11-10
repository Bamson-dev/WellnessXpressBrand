"use client";
import { useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";

export default function AddToCart({ sku, slug, name, price, disabled }: { sku: string; slug: string; name: string; price: number; disabled?: boolean }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  return (
    <div className="mt-6">
      <div className="flex items-center gap-4">
        <label htmlFor="qty" className="text-sm font-medium">Quantity</label>
        <input id="qty" type="number" min={1} max={20} value={qty} className="field w-24"
          onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
      </div>
      <button className="btn btn-primary mt-4 w-full sm:w-auto" disabled={disabled}
        onClick={() => { add({ sku, slug, name, price }, qty); setAdded(true); }}>
        {disabled ? "Unavailable" : "Add to cart"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-sage-700">
        {added && (<>Added to your cart. <Link href="/cart" className="underline">View cart</Link></>)}
      </p>
    </div>
  );
}
