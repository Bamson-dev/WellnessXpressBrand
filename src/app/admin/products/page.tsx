import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { allProductsAdmin, getCategories } from "@/lib/catalog";
import { archiveProductAction, bulkProductsAction, createFlyerCatalogAction, createProductAction, duplicateProductAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import { naira } from "@/lib/site";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Products" };

export default async function Products(
  props: { searchParams: Promise<{ msg?: string; q?: string; status?: string; type?: string; stock?: string; sort?: string; category?: string; featured?: string; page?: string }> }
) {
  const searchParams = await props.searchParams;
  await requirePerm("products");
  const q = (searchParams.q || "").trim().toLowerCase();
  const status = searchParams.status || "all";
  const type = searchParams.type || "all";
  const stock = searchParams.stock || "all";
  const sort = searchParams.sort || "default";
  const category = searchParams.category || "all";
  const featured = searchParams.featured || "all";
  const categories = getCategories(true);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const perPage = 25;
  const all = allProductsAdmin().filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.variants.some((v) => v.sku.toLowerCase().includes(q))) return false;
    if (status !== "all" && p.status !== status) return false;
    if (type !== "all" && p.type !== type) return false;
    if (category !== "all" && p.category !== category) return false;
    if (featured === "yes" && !p.featured) return false;
    if (featured === "no" && p.featured) return false;
    if (stock === "tracked" && !p.variants.some((v) => v.stock != null)) return false;
    if (stock === "out" && !p.variants.some((v) => v.stock === 0)) return false;
    if (stock === "available" && !p.variants.some((v) => v.stock == null || v.stock > 0)) return false;
    return true;
  });
  if (sort === "name") all.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "newest") all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sort === "oldest") all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sort === "price") all.sort((a, b) => (a.variants[0]?.price ?? 0) - (b.variants[0]?.price ?? 0));
  if (sort === "stock") all.sort((a, b) => (a.variants[0]?.stock ?? Number.MAX_SAFE_INTEGER) - (b.variants[0]?.stock ?? Number.MAX_SAFE_INTEGER));
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const products = all.slice((Math.min(page, pages) - 1) * perPage, Math.min(page, pages) * perPage);
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Products and combo sets</h1>
      <AdminForm action={createProductAction} className="mt-4 flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-4">
        <input name="name" placeholder="New product name" className="admin-input max-w-xs" required />
        <select name="type" className="admin-input w-auto"><option value="single">Individual product</option><option value="combo">Combo set</option></select>
        <button className="admin-btn">Add product</button>
      </AdminForm>
      <AdminForm action={createFlyerCatalogAction} className="mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
        <input type="hidden" name="confirm" value="yes" />
        <button className="admin-btn" type="submit">Create flyer catalog (12 products)</button>
        <span className="text-xs text-neutral-600">Creates missing products as drafts. Existing products are skipped. Add photos before publishing.</span>
      </AdminForm>
      <form method="get" className="mt-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-7">
        <input name="q" defaultValue={searchParams.q} placeholder="Search name or SKU" className="admin-input" />
        <select name="status" defaultValue={status} className="admin-input"><option value="all">All statuses</option>{["published", "draft", "pending_confirmation", "archived"].map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>
        <select name="type" defaultValue={type} className="admin-input"><option value="all">All types</option><option value="single">Individual</option><option value="combo">Combo</option></select>
        <select name="category" defaultValue={category} className="admin-input"><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <select name="stock" defaultValue={stock} className="admin-input"><option value="all">All stock</option><option value="tracked">Tracked</option><option value="available">Available</option><option value="out">Out of stock</option></select>
        <select name="featured" defaultValue={featured} className="admin-input"><option value="all">All featured states</option><option value="yes">Featured</option><option value="no">Not featured</option></select>
        <select name="sort" defaultValue={sort} className="admin-input"><option value="default">Catalog order</option><option value="name">Name</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="price">Price</option><option value="stock">Stock quantity</option></select>
        <button className="admin-btn">Apply filters</button>
      </form>
      <AdminForm action={bulkProductsAction} id="bulk-products" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <span className="text-neutral-600">With ticked products:</span>
        <select name="op" className="admin-input w-auto" aria-label="Bulk action"><option value="publish">Publish</option><option value="draft">Move to draft</option><option value="feature">Feature on home page</option><option value="unfeature">Stop featuring</option><option value="archive">Archive</option></select>
        <button className="admin-btn">Apply</button>
      </AdminForm>
      <p className="mt-3 text-sm text-neutral-500">{all.length} matching products · page {Math.min(page, pages)} of {pages}</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Category</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Price options</th><th className="p-3">Stock</th><th className="p-3">Updated</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const flags = p.variants.filter((v) => v.needsConfirmation && v.status === "active").length;
              return (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="p-3"><input type="checkbox" name="ids" value={p.id} form="bulk-products" className="h-4 w-4 accent-brand-700" aria-label={`Select ${p.name}`} /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.images[0] ? <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.images[0]} alt="" className="h-12 w-12 rounded border border-neutral-100 bg-brand-50 object-contain" />
                      </> : <span className="grid h-12 w-12 place-items-center rounded bg-neutral-100 text-[10px] text-neutral-500">No image</span>}
                      <div>
                    <Link href={`/admin/products/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>
                    {p.featured ? <span className="ml-2 rounded bg-brand-50 px-1.5 text-xs text-brand-900">Featured</span> : null}
                    {flags ? <p className="mt-1 text-xs font-semibold text-amber-700">{flags} price{flags === 1 ? "" : "s"} to confirm</p> : null}
                    <div className="mt-2 flex flex-wrap gap-3">
                      <AdminForm action={duplicateProductAction}><input type="hidden" name="id" value={p.id} /><button className="text-xs font-semibold text-brand-700 underline">Duplicate</button></AdminForm>
                      {p.status !== "archived" ? <details className="text-xs"><summary className="cursor-pointer text-red-700 underline">Archive</summary><AdminForm action={archiveProductAction} className="mt-1 rounded border border-red-200 bg-red-50 p-2"><input type="hidden" name="id" value={p.id} /><p className="mb-1 text-red-900">This hides the product. Existing order records remain.</p><button className="font-semibold text-red-800 underline">Confirm archive</button></AdminForm></details> : null}
                    </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">{p.variants.map((v) => <div key={v.id} className="font-mono text-xs">{v.sku}</div>)}</td>
                  <td className="p-3">{categories.find((c) => c.slug === p.category)?.name || p.category}</td>
                  <td className="p-3">{p.type === "combo" ? "Combo set" : "Individual"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "published" ? "bg-brand-50 text-brand-900" : "bg-neutral-100"}`}>{p.status.replace("_", " ")}</span></td>
                  <td className="p-3">{p.variants.length ? p.variants.map((v) => <div key={v.id} className={v.status !== "active" ? "text-neutral-400 line-through" : ""}>{v.label}: {naira(v.price)}{v.salePrice != null ? ` (sale ${naira(v.salePrice)})` : ""}</div>) : <span className="text-neutral-400">None</span>}</td>
                  <td className="p-3">{p.variants.map((v) => <div key={v.id}>{v.stock == null ? "Not tracked" : v.stock}</div>)}</td>
                  <td className="p-3 whitespace-nowrap text-xs text-neutral-500">{new Date(p.updatedAt.replace(" ", "T") + "Z").toLocaleDateString("en-NG")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 ? <nav className="mt-4 flex items-center justify-between" aria-label="Product pages">
        <a className={`admin-btn-ghost ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={`?${new URLSearchParams({ ...(searchParams.q ? { q: searchParams.q } : {}), ...(status !== "all" ? { status } : {}), ...(type !== "all" ? { type } : {}), ...(category !== "all" ? { category } : {}), ...(featured !== "all" ? { featured } : {}), ...(stock !== "all" ? { stock } : {}), ...(sort !== "default" ? { sort } : {}), page: String(Math.max(1, page - 1)) })}`}>Previous</a>
        <a className={`admin-btn-ghost ${page >= pages ? "pointer-events-none opacity-40" : ""}`} href={`?${new URLSearchParams({ ...(searchParams.q ? { q: searchParams.q } : {}), ...(status !== "all" ? { status } : {}), ...(type !== "all" ? { type } : {}), ...(category !== "all" ? { category } : {}), ...(featured !== "all" ? { featured } : {}), ...(stock !== "all" ? { stock } : {}), ...(sort !== "default" ? { sort } : {}), page: String(Math.min(pages, page + 1)) })}`}>Next</a>
      </nav> : null}
    </div>
  );
}
