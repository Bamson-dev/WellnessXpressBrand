import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Shop", description: "Browse all wellness and lifestyle products.", alternates: { canonical: "/shop" } };
export const dynamic = "force-dynamic";

export default function Shop({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q || "").slice(0, 80);
  const products = getProducts(undefined, q);
  return (
    <div className="container-x py-12">
      <h1 className="text-4xl">Shop</h1>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/shop" className="btn btn-primary !py-2">All</Link>
        {getCategories().map((c) => <Link key={c.slug} href={`/category/${c.slug}`} className="btn btn-outline !py-2">{c.name}</Link>)}
        <form action="/shop" method="get" className="ml-auto flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Search products</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search products" className="field !py-2" />
          <button className="btn btn-outline !py-2">Search</button>
        </form>
      </div>
      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.sku} p={p} />)}</div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-sage-200 bg-white p-10 text-center">
          <p className="font-serif text-xl">{q ? "No products match your search." : "The catalogue is being prepared."}</p>
          <p className="mt-2 text-ink/70">{q ? "Try a different word." : "Products will appear here soon."}</p>
        </div>
      )}
    </div>
  );
}
