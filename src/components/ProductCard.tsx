import Link from "next/link";
import Image from "next/image";
import { effective, inStock, priceRange, type Product } from "@/lib/catalog";
import { QuickAdd } from "@/components/AddToCart";
import { naira } from "@/lib/site";

export default function ProductCard({ p, priority }: { p: Product; priority?: boolean }) {
  const range = priorityRange(p);
  const comboImageOverrides: Record<string, string> = {
    "2-weeks-combo-set": "/images/products/combos/2-weeks-combo-set.webp",
    "1-month-combo-set": "/images/products/combos/1-month-combo-set.webp",
    "1-month-full-kit": "/images/products/combos/full-product-group-alternate.webp",
    "mini-combo-set": "/images/products/combos/mini-combo-set.webp",
    "maxi-combo-set": "/images/products/combos/maxi-combo-set.webp",
    "tummy-set": "/images/products/combos/tummy-set.webp",
  };
  const img = comboImageOverrides[p.slug] || p.images[0] || null;
  const single = p.variants.length === 1 ? p.variants[0] : null;
  const detail = p.type === "combo" ? `${p.items.length} products` : p.variants.map((v) => v.label).join(" · ");
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/product/${p.slug}`} className="relative block aspect-square overflow-hidden bg-gradient-to-b from-white to-brand-50" aria-label={p.name}>
        {img ? (
          <Image src={img} alt={`${p.name} by WellnessXpress`} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain transition duration-300 group-hover:scale-[1.03]" priority={priority} />
        ) : null}
        {p.type === "combo" ? <span className="tag absolute left-3 top-3 bg-white/95 shadow-sm">Combo set</span> : null}
      </Link>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="text-[15px] font-semibold leading-snug sm:text-base">
          <Link href={`/product/${p.slug}`} className="hover:text-brand-700">{p.name}</Link>
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-neutral-500 sm:text-sm">{detail}</p>
        <p className="mt-2 text-base font-bold text-ink sm:text-lg">
          {range ? (range.min === range.max ? naira(range.min) : <>From {naira(range.min)}</>) : "—"}
        </p>
        <p className="mt-1 text-[11px] font-bold text-brand-700 sm:text-xs">Free delivery on ₦50,000+ orders</p>
        <div className="mt-auto grid gap-2 pt-3">
          {single ? (
            <QuickAdd product={{ slug: p.slug, name: p.name, image: img }} variant={{ id: single.id, sku: single.sku, label: single.label, price: effective(single), compareAt: null, inStock: inStock(single), detail: "" }} />
          ) : (
            <Link href={`/product/${p.slug}`} className="btn btn-primary min-h-[44px] w-full px-4 text-sm">Choose option</Link>
          )}
          <Link href={`/product/${p.slug}`} className="text-center text-sm font-semibold text-brand-700 hover:underline">View product</Link>
        </div>
      </div>
    </article>
  );
}

const priorityRange = (p: Product) => priceRange(p);
