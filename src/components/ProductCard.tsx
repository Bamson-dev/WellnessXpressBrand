import Link from "next/link";
import { effectivePrice, isSample, type Product } from "@/lib/products";
import { naira } from "@/lib/site";

export function ProductImage({ p, className = "" }: { p: Product; className?: string }) {
  if (p.images[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.images[0]} alt={p.name} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-sage-100 text-sage-600 ${className}`} role="img" aria-label={`${p.name} image placeholder`}>
      <span className="text-xs font-medium uppercase tracking-widest">Image coming soon</span>
    </div>
  );
}

export default function ProductCard({ p }: { p: Product }) {
  const price = effectivePrice(p);
  return (
    <Link href={`/product/${p.slug}`} className="group block overflow-hidden rounded-2xl border border-sage-100 bg-white transition hover:shadow-md">
      <div className="aspect-square overflow-hidden"><ProductImage p={p} /></div>
      <div className="p-4">
        {isSample(p) && <p className="mb-1 text-xs font-semibold uppercase text-clay-500">Sample, not for sale</p>}
        <h3 className="text-base font-semibold group-hover:text-sage-600">{p.name}</h3>
        <p className="mt-2 text-sm">
          <span className="font-semibold">{naira(price)}</span>
          {price < p.price && <span className="ml-2 text-ink/50 line-through">{naira(p.price)}</span>}
        </p>
        {p.availability === "out_of_stock" && <p className="mt-1 text-xs text-red-700">Out of stock</p>}
      </div>
    </Link>
  );
}
