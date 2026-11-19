import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { allProductsAdmin, getCategories, getProductById } from "@/lib/catalog";
import Flash from "@/components/admin/Flash";
import UnsavedGuard from "@/components/admin/UnsavedGuard";
import { listMedia } from "@/lib/media";
import { addFromLibraryAction, deleteProductAction, deleteVariantAction, imageOrderAction, replaceImageAction, saveMediaMetaAction, saveComboItemsAction, saveProductAction, saveVariantAction, uploadImageAction } from "@/app/admin/actions";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Edit product" };

export default async function EditProduct(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requirePerm("products");
  const p = getProductById(Number(params.id));
  if (!p) notFound();
  const meta = Object.fromEntries(p.images.map((u) => [u, (() => { const m = listMedia().find((x) => x.url === u); return m ? { id: m.id, alt: m.alt, caption: m.caption } : null; })()]));
  const library = listMedia().filter((m) => !p.images.includes(m.url)).slice(0, 200);
  const categories = getCategories(true);
  const singles = allProductsAdmin().filter((x) => x.type === "single");
  const L = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</span>;
  const comboRows = [...p.items, ...Array.from({ length: Math.max(0, 6 - p.items.length) }, () => null)];

  return (
    <div>
      <Link href="/admin/products" className="text-sm font-semibold text-brand-700">← Products</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{p.name}</h1>
        {p.status === "published" ? <Link href={`/product/${p.slug}`} target="_blank" className="text-sm text-brand-700 underline">View in store</Link> : <Link href={`/product/${p.slug}?preview=1`} target="_blank" className="text-sm text-brand-700 underline">Preview (only you can see it)</Link>}
      </div>
      <div className="mt-4"><Flash msg={searchParams.msg} /></div>
      {p.reviewNote ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Needs confirmation:</strong> {p.reviewNote}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <AdminForm action={saveProductAction} id="product-form" className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          <UnsavedGuard formId="product-form" />
          <input type="hidden" name="id" value={p.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label><L>Name</L><input name="name" defaultValue={p.name} className="admin-input" required /></label>
            <label><L>Web address (slug)</L><input name="slug" defaultValue={p.slug} className="admin-input" required /></label>
            <label><L>Status</L>
              <select name="status" defaultValue={p.status} className="admin-input">
                <option value="published">Published (visible)</option><option value="draft">Draft (hidden)</option>
                <option value="pending_confirmation">Pending confirmation (hidden)</option><option value="archived">Archived (hidden)</option>
              </select>
            </label>
            <label><L>Category</L>
              <select name="category" defaultValue={p.category} className="admin-input">{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}{c.status === "hidden" ? " (hidden)" : ""}</option>)}</select>
            </label>
            <label><L>Sort order (lower shows first)</L><input name="sort" type="number" defaultValue={p.sort} className="admin-input" /></label>
            <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name="featured" defaultChecked={p.featured} className="h-4 w-4 accent-brand-700" /> Featured on the home page</label>
          </div>
          <label className="block"><L>Short description (cards and search)</L><input name="short" defaultValue={p.shortDescription} className="admin-input" /></label>
          <label className="block"><L>Description (blank line = new paragraph · **bold** · *italic* · lines starting with &quot;- &quot; become a list · &quot;## &quot; for a heading)</L><textarea name="description" defaultValue={p.description} rows={8} className="admin-input font-mono text-[13px]" /></label>
          <label className="block"><L>Ingredients (only as confirmed or printed on the label)</L><textarea name="ingredients" defaultValue={p.ingredients} rows={2} className="admin-input" /></label>
          <label className="block"><L>Directions for use (leave empty until confirmed)</L><textarea name="directions" defaultValue={p.directions} rows={3} className="admin-input" /></label>
          <label className="block"><L>Product information</L><textarea name="information" defaultValue={p.information} rows={3} className="admin-input" /></label>
          <label className="block"><L>Questions (Q: question, then A: answer, blank line between)</L><textarea name="faqs" defaultValue={p.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")} rows={4} className="admin-input" /></label>
          <label className="block"><L>Related products (slugs, comma separated)</L><input name="related" defaultValue={p.related.join(", ")} className="admin-input" /></label>
          <label className="block"><L>Internal note: what still needs confirmation</L><textarea name="review" defaultValue={p.reviewNote} rows={2} className="admin-input" /></label>
          <button className="admin-btn">Save product</button>
        </AdminForm>

        <div className="space-y-5">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg">Photos</h2>
            <p className="text-xs text-neutral-500">The first photo is the main image on cards and in the cart.</p>
            <div className="mt-3 space-y-3">
              {p.images.map((src, i) => {
                const m = meta[src];
                return (
                  <div key={src + i} className="flex gap-3 rounded-lg border border-neutral-200 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={m?.alt || ""} className="h-24 w-24 shrink-0 rounded bg-brand-50 object-contain" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {i > 0 ? <AdminForm action={imageOrderAction}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="index" value={i} /><input type="hidden" name="op" value="first" /><button className="text-brand-700 underline">Make main</button></AdminForm> : <span className="font-semibold text-brand-700">Main photo</span>}
                        {i > 0 ? <AdminForm action={imageOrderAction}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="index" value={i} /><input type="hidden" name="op" value="up" /><button aria-label={`Move photo ${i + 1} up`} className="text-neutral-600 underline">Move up</button></AdminForm> : null}
                        {i < p.images.length - 1 ? <AdminForm action={imageOrderAction}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="index" value={i} /><input type="hidden" name="op" value="down" /><button aria-label={`Move photo ${i + 1} down`} className="text-neutral-600 underline">Move down</button></AdminForm> : null}
                        <AdminForm action={imageOrderAction}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="index" value={i} /><input type="hidden" name="op" value="remove" /><button className="text-red-700 underline">Remove from product</button></AdminForm>
                      </div>
                      {m ? (
                        <AdminForm action={saveMediaMetaAction} className="flex flex-wrap gap-1">
                          <input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={`/admin/products/${p.id}`} />
                          <input name="alt" defaultValue={m.alt} placeholder="Alt text" className="admin-input min-w-0 flex-1 py-1" aria-label={`Alt text for photo ${i + 1}`} />
                          <input name="caption" defaultValue={m.caption} placeholder="Caption" className="admin-input min-w-0 flex-1 py-1" aria-label={`Caption for photo ${i + 1}`} />
                          <button className="admin-btn-ghost px-2 py-1 text-xs">Save</button>
                        </AdminForm>
                      ) : null}
                      <AdminForm action={replaceImageAction} className="flex flex-wrap items-center gap-1 text-xs">
                        <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="index" value={i} />
                        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="max-w-[180px] text-xs" aria-label={`Replacement for photo ${i + 1}`} required />
                        <button className="text-brand-700 underline">Replace</button>
                      </AdminForm>
                    </div>
                  </div>
                );
              })}
            </div>
            <AdminForm action={uploadImageAction} className="mt-3 space-y-2">
              <input type="hidden" name="productId" value={p.id} />
              <input type="file" name="image" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" required aria-label="Upload photos" />
              <button className="admin-btn-ghost">Upload photos</button>
            </AdminForm>
            {library.length ? (
              <AdminForm action={addFromLibraryAction} className="mt-3 flex gap-2">
                <input type="hidden" name="productId" value={p.id} />
                <select name="mediaId" className="admin-input" aria-label="Image from library" required defaultValue="">
                  <option value="" disabled>Add from media library…</option>
                  {library.map((m) => <option key={m.id} value={m.id}>{m.originalName || m.url.split("/").pop()}{m.alt ? ` — ${m.alt}` : ""}</option>)}
                </select>
                <button className="admin-btn-ghost">Add</button>
              </AdminForm>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">Use real photos of the actual packaging. Square images on a light background look best.</p>
          </section>
        </div>
      </div>

      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg">Price options</h2>
        <p className="text-sm text-neutral-500">Each option (size or duration) has its own price, SKU and stock. Leave stock empty to sell without tracking stock.</p>
        <div className="mt-3 space-y-3">
          {[...p.variants, null].map((v, i) => (
            <AdminForm key={v?.id ?? "new"} action={saveVariantAction} className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-6 lg:grid-cols-12 ${v?.needsConfirmation ? "border-amber-300 bg-amber-50/50" : "border-neutral-200"}`}>
              <input type="hidden" name="productId" value={p.id} />
              {v ? <input type="hidden" name="variantId" value={v.id} /> : null}
              <label className="lg:col-span-2"><L>{v ? "Option" : "New option"}</L><input name="label" defaultValue={v?.label} placeholder="e.g. Big" className="admin-input" required /></label>
              <label className="lg:col-span-1"><L>Size</L><input name="size" defaultValue={v?.size} className="admin-input" /></label>
              <label className="lg:col-span-1"><L>Duration</L><input name="duration" defaultValue={v?.duration} className="admin-input" /></label>
              <label className="lg:col-span-1"><L>Price ₦</L><input name="price" inputMode="numeric" defaultValue={v?.price} className="admin-input" required /></label>
              <label className="lg:col-span-1"><L>Sale ₦</L><input name="salePrice" inputMode="numeric" defaultValue={v?.salePrice ?? ""} className="admin-input" /></label>
              <label className="lg:col-span-1"><L>Stock</L><input name="stock" inputMode="numeric" defaultValue={v?.stock ?? ""} placeholder="—" className="admin-input" /></label>
              <label className="lg:col-span-2"><L>SKU</L><input name="sku" defaultValue={v?.sku} placeholder="auto" className="admin-input" /></label>
              <label className="lg:col-span-1"><L>Show</L><select name="status" defaultValue={v?.status || "active"} className="admin-input"><option value="active">On</option><option value="inactive">Off</option></select></label>
              <input type="hidden" name="sort" value={v?.sort ?? i} />
              <div className="flex flex-col justify-end gap-1 lg:col-span-2">
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="confirmed" defaultChecked={v ? !v.needsConfirmation : true} className="accent-brand-700" /> Price confirmed</label>
                <button className="admin-btn py-1.5">{v ? "Save" : "Add option"}</button>
              </div>
              {v?.priceSource ? <p className="text-xs text-neutral-500 sm:col-span-6 lg:col-span-12">Source: {v.priceSource}</p> : null}
            </AdminForm>
          ))}
        </div>
        {p.variants.length ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {p.variants.map((v) => (
              <AdminForm key={v.id} action={deleteVariantAction}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v.id} /><button className="text-red-700 underline">Delete “{v.label}”</button></AdminForm>
            ))}
          </div>
        ) : null}
      </section>

      {p.status === "archived" ? (
        <details className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm">
          <summary className="cursor-pointer font-semibold text-red-800">Delete this product permanently</summary>
          <p className="mt-2 text-red-900">Only possible if the product was never ordered and is not part of a combo. Otherwise it stays archived for your records.</p>
          <AdminForm action={deleteProductAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input name="confirm" placeholder={`Type: ${p.name}`} className="admin-input max-w-xs" aria-label="Type the product name to confirm" />
            <button className="admin-btn-danger">Delete permanently</button>
          </AdminForm>
        </details>
      ) : null}

      {p.type === "combo" ? (
        <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg">What is in this set</h2>
          <p className="text-sm text-neutral-500">Choose each product and record its size and quantity. Leave size empty if not yet confirmed; the store then asks customers to check on WhatsApp.</p>
          <AdminForm action={saveComboItemsAction} className="mt-3 space-y-2">
            <input type="hidden" name="productId" value={p.id} />
            {comboRows.map((it, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-4">
                <select name={`item_pid_${i}`} defaultValue={it?.itemProductId ?? ""} className="admin-input">
                  <option value="">— product —</option>
                  {singles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input name={`item_name_${i}`} defaultValue={it?.itemName ?? ""} placeholder="Display name" className="admin-input" />
                <input name={`item_size_${i}`} defaultValue={it?.sizeNote ?? ""} placeholder="Size (e.g. Big)" className="admin-input" />
                <input name={`item_qty_${i}`} defaultValue={it?.quantityNote ?? ""} placeholder="Quantity (e.g. 1 pouch)" className="admin-input" />
              </div>
            ))}
            <button className="admin-btn">Save set contents</button>
          </AdminForm>
        </section>
      ) : null}
    </div>
  );
}
