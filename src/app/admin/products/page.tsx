import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { allProductsAdmin } from "@/lib/catalog";
import { createProductAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import { naira } from "@/lib/site";

export const metadata = { title: "Products" };

export default async function Products({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const products = allProductsAdmin();
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Products and combo sets</h1>
      <form action={createProductAction} className="mt-4 flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-4">
        <input name="name" placeholder="New product name" className="admin-input max-w-xs" required />
        <select name="type" className="admin-input w-auto"><option value="single">Individual product</option><option value="combo">Combo set</option></select>
        <button className="admin-btn">Add product</button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Price options</th><th className="p-3">Stock</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const flags = p.variants.filter((v) => v.needsConfirmation && v.status === "active").length;
              return (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="p-3">
                    <Link href={`/admin/products/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>
                    {p.featured ? <span className="ml-2 rounded bg-brand-50 px-1.5 text-xs text-brand-900">Featured</span> : null}
                    {flags ? <p className="mt-1 text-xs font-semibold text-amber-700">{flags} price{flags === 1 ? "" : "s"} to confirm</p> : null}
                  </td>
                  <td className="p-3">{p.type === "combo" ? "Combo set" : "Individual"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "published" ? "bg-brand-50 text-brand-900" : "bg-neutral-100"}`}>{p.status.replace("_", " ")}</span></td>
                  <td className="p-3">{p.variants.length ? p.variants.map((v) => <div key={v.id} className={v.status !== "active" ? "text-neutral-400 line-through" : ""}>{v.label}: {naira(v.price)}{v.salePrice != null ? ` (sale ${naira(v.salePrice)})` : ""}</div>) : <span className="text-neutral-400">None</span>}</td>
                  <td className="p-3">{p.variants.map((v) => <div key={v.id}>{v.stock == null ? "Not tracked" : v.stock}</div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
