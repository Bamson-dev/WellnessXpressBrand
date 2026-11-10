import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import AddToCart from "@/components/AddToCart";
import { ProductImage } from "@/components/ProductCard";
import { effectivePrice, getCategories, getProduct, isSample } from "@/lib/products";
import { naira, site } from "@/lib/site";

export const dynamic = "force-dynamic";
type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const p = getProduct(params.slug);
  if (!p) return {};
  return { title: p.name, description: p.description.slice(0, 155), alternates: { canonical: `/product/${p.slug}` }, openGraph: { title: p.name, description: p.description.slice(0, 155), images: p.images[0] ? [p.images[0]] : undefined } };
}

export default function ProductPage({ params }: Props) {
  const p = getProduct(params.slug);
  if (!p) notFound();
  const price = effectivePrice(p);
  const cat = getCategories().find((c) => c.slug === p.category);
  const sample = isSample(p);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.sku, description: p.description,
    image: p.images.map((i) => (i.startsWith("http") ? i : site.url + i)),
    offers: { "@type": "Offer", priceCurrency: "NGN", price, url: `${site.url}/product/${p.slug}`,
      availability: p.availability === "in_stock" ? "https://schema.org/InStock" : p.availability === "preorder" ? "https://schema.org/PreOrder" : "https://schema.org/OutOfStock" },
  };
  const avail = { in_stock: "In stock", out_of_stock: "Out of stock", preorder: "Pre-order" }[p.availability];
  return (
    <div className="container-x py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink/60">
        <Link href="/shop">Shop</Link> / {cat && <><Link href={`/category/${cat.slug}`}>{cat.name}</Link> / </>}{p.name}
      </nav>
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-3xl border border-sage-100"><ProductImage p={p} /></div>
        <div>
          {sample && <p className="mb-2 rounded-lg bg-clay-400/20 p-2 text-sm font-semibold text-clay-500">Sample entry for layout only. Not a real product.</p>}
          <h1 className="text-3xl sm:text-4xl">{p.name}</h1>
          <p className="mt-4 text-2xl font-semibold">
            {naira(price)}{price < p.price && <span className="ml-3 text-lg font-normal text-ink/50 line-through">{naira(p.price)}</span>}
          </p>
          <p className="mt-2 text-sm text-ink/70">{avail} &middot; SKU {p.sku}</p>
          <p className="mt-6 leading-7 text-ink/85">{p.description}</p>
          {Object.keys(p.attributes).length > 0 && (
            <dl className="mt-6 divide-y divide-sage-100 rounded-xl bg-white text-sm">
              {Object.entries(p.attributes).map(([k, v]) => (
                <div key={k} className="flex justify-between p-3"><dt className="font-medium">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
          <AddToCart sku={p.sku} slug={p.slug} name={p.name} price={price} disabled={p.availability === "out_of_stock"} />
          <p className="mt-6 text-xs text-ink/60">General information only. Not medical advice.</p>
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
