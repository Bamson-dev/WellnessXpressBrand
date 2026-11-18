"use client";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import QtyControl from "@/components/QtyControl";
import { IconCart } from "@/components/icons";
import { naira } from "@/lib/site";

export type VariantOpt = { id: number; label: string; price: number; compareAt: number | null; inStock: boolean; detail: string };

/** Full purchase box for product pages: variant choice, quantity and add to cart. */
export function PurchaseBox({ product, variants }: { product: { slug: string; name: string; image: string | null }; variants: VariantOpt[] }) {
  const { add } = useCart();
  const first = variants.find((v) => v.inStock) || variants[0];
  const [vid, setVid] = useState(first?.id);
  const [qty, setQty] = useState(1);
  const v = variants.find((x) => x.id === vid) || first;
  if (!v) return <p className="rounded-xl bg-neutral-100 p-4 text-neutral-700">This product is not available to order right now.</p>;
  return (
    <div>
      <p className="flex items-baseline gap-3">
        <span className="text-3xl font-bold text-ink">{naira(v.price)}</span>
        {v.compareAt ? <span className="text-lg text-neutral-400 line-through">{naira(v.compareAt)}</span> : null}
      </p>
      {variants.length > 1 ? (
        <fieldset className="mt-5">
          <legend className="mb-2 text-[15px] font-semibold">Choose an option</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {variants.map((o) => (
              <label key={o.id} className={`relative flex min-h-[64px] cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 text-left transition ${o.id === v.id ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-neutral-300 hover:border-brand-500"} ${!o.inStock ? "opacity-50" : ""}`}>
                <input type="radio" name="variant" value={o.id} checked={o.id === v.id} onChange={() => setVid(o.id)} disabled={!o.inStock} className="sr-only" />
                <span className="text-[15px] font-semibold">{o.label}</span>
                <span className="text-sm text-neutral-600">{o.inStock ? naira(o.price) : "Out of stock"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : v.detail ? <p className="mt-2 text-neutral-600">{v.detail}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <QtyControl value={qty} onChange={(n) => setQty(Math.max(1, n))} label="Quantity" />
        <button type="button" disabled={!v.inStock} onClick={() => add({ variantId: v.id, slug: product.slug, name: product.name, label: v.label, price: v.price, image: product.image }, qty)}
          className="btn btn-primary min-w-[200px] flex-1 text-base">
          <IconCart /> {v.inStock ? "Add to cart" : "Out of stock"}
        </button>
      </div>
    </div>
  );
}

/** Compact add button for product cards. Products with several options link to the product page instead. */
export function QuickAdd({ product, variant }: { product: { slug: string; name: string; image: string | null }; variant: VariantOpt }) {
  const { add } = useCart();
  return (
    <button type="button" disabled={!variant.inStock} onClick={() => add({ variantId: variant.id, slug: product.slug, name: product.name, label: variant.label, price: variant.price, image: product.image })}
      className="btn btn-primary min-h-[44px] w-full px-4 text-sm">
      {variant.inStock ? "Add to cart" : "Out of stock"}
    </button>
  );
}
