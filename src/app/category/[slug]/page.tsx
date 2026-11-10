import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts } from "@/lib/products";

export const dynamic = "force-dynamic";
type Props = { params: { slug: string } };
const find = (slug: string) => getCategories().find((c) => c.slug === slug);

export function generateMetadata({ params }: Props): Metadata {
  const c = find(params.slug);
  if (!c) return {};
  return { title: c.name, description: c.description, alternates: { canonical: `/category/${c.slug}` } };
}

export default function Category({ params }: Props) {
  const c = find(params.slug);
  if (!c) notFound();
  const products = getProducts(c.slug);
  return (
    <div className="container-x py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink/60"><Link href="/shop">Shop</Link> / {c.name}</nav>
      <h1 className="mt-2 text-4xl">{c.name}</h1>
      <p className="mt-2 text-ink/70">{c.description}</p>
      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.sku} p={p} />)}</div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-sage-200 bg-white p-10 text-center">
          <p className="font-serif text-xl">No products in this category yet.</p>
        </div>
      )}
    </div>
  );
}
