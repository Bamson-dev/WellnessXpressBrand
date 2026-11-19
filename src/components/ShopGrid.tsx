import Link from "next/link";
import { getCategories, listProducts } from "@/lib/catalog";
import ProductCard from "@/components/ProductCard";
import SortSelect from "@/components/SortSelect";
import { IconSearch } from "@/components/icons";

type SP = { q?: string; sort?: string; page?: string; category?: string };

export default function ShopGrid({ sp, category, basePath, title, intro }: { sp: SP; category?: string; basePath: string; title: string; intro: string }) {
  const q = (sp.q || "").slice(0, 60);
  const sort = ["featured", "newest", "price-asc", "price-desc"].includes(sp.sort || "") ? sp.sort : "featured";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const categories = getCategories();
  const cat = category || (categories.some((c) => c.slug === sp.category) ? sp.category : undefined);
  const res = listProducts({ category: cat, q, sort, page, perPage: 12 });
  const qs = (o: Partial<SP>) => {
    const u = new URLSearchParams();
    const m = { q, sort: sort === "featured" ? "" : sort, category: category ? "" : cat || "", page: "", ...o };
    Object.entries(m).forEach(([k, v]) => v && u.set(k, String(v)));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-neutral-600">{intro}</p>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <Link href={category ? "/shop" : qs({ category: "" })} className={`shrink-0 rounded-full border px-4 py-2.5 text-[15px] font-medium ${!cat ? "border-brand-700 bg-brand-700 text-white" : "border-neutral-300 hover:border-brand-500"}`}>All</Link>
          {categories.map((c) => (
            <Link key={c.slug} href={category ? `/category/${c.slug}` : qs({ category: c.slug })} className={`shrink-0 rounded-full border px-4 py-2.5 text-[15px] font-medium ${cat === c.slug ? "border-brand-700 bg-brand-700 text-white" : "border-neutral-300 hover:border-brand-500"}`}>{c.name}</Link>
          ))}
        </nav>
        <div className="flex gap-2">
          <form action={basePath} role="search" className="relative flex-1 lg:w-72 lg:flex-none">
            {cat && !category ? <input type="hidden" name="category" value={cat} /> : null}
            {sort !== "featured" ? <input type="hidden" name="sort" value={sort} /> : null}
            <label className="sr-only" htmlFor="shop-q">Search products</label>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
            <input id="shop-q" name="q" defaultValue={q} type="search" placeholder="Search by product name" className="field pl-11" />
          </form>
          <SortSelect value={sort || "featured"} />
        </div>
      </div>

      {q ? <p className="mt-5 text-neutral-700">{res.total} result{res.total === 1 ? "" : "s"} for “{q}”. <Link href={qs({ q: "" })} className="font-semibold text-brand-700 hover:underline">Clear search</Link></p> : null}

      {res.items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {res.items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 4} />)}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 p-10 text-center">
          <p className="text-lg font-semibold">No products found</p>
          <p className="mt-1 text-neutral-600">Try another word, or browse all products.</p>
          <Link href="/shop" className="btn btn-primary mt-5">View all products</Link>
        </div>
      )}

      {res.pages > 1 ? (
        <nav aria-label="Pages" className="mt-10 flex flex-wrap justify-center gap-2">
          {Array.from({ length: res.pages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={qs({ page: n === 1 ? "" : String(n) })} aria-current={n === res.page ? "page" : undefined}
              className={`grid h-11 min-w-11 place-items-center rounded-full border px-3 font-semibold ${n === res.page ? "border-brand-700 bg-brand-700 text-white" : "border-neutral-300 hover:border-brand-500"}`}>{n}</Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
