import { requirePerm } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { createCategoryAction, saveCategoryAction, uploadCategoryImageAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Categories" };

export default async function CategoriesPage(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("categories");
  const categories = getCategories(true);
  const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</span>;
  return <div>
    <Flash msg={searchParams.msg} />
    <h1 className="text-2xl">Categories</h1>
    <p className="mt-1 text-sm text-neutral-600">Manage category names, descriptions, images, visibility, ordering and search metadata. Hiding a category preserves its products and order history.</p>
    <form action={createCategoryAction} className="mt-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_2fr_auto]">
      <label><Label>New category name</Label><input name="name" className="admin-input" required maxLength={80} /></label>
      <label><Label>Description</Label><input name="description" className="admin-input" maxLength={1000} /></label>
      <button className="admin-btn self-end">Create hidden category</button>
    </form>
    <div className="mt-5 space-y-4">
      {categories.map((c) => <section key={c.id} className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <span className="text-sm text-neutral-500">{c.productCount} assigned product{c.productCount === 1 ? "" : "s"} · {c.status}</span>
        </div>
        <form action={saveCategoryAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={c.id} />
          <label><Label>Name</Label><input name="name" defaultValue={c.name} className="admin-input" required maxLength={80} /></label>
          <label><Label>URL slug</Label><input name="slug" defaultValue={c.slug} className="admin-input" required maxLength={70} /></label>
          <label><Label>Category image path</Label><input name="image" defaultValue={c.image} className="admin-input" placeholder="/images/categories/..." /></label>
          <label><Label>Status</Label><select name="status" defaultValue={c.status} className="admin-input"><option value="published">Published</option><option value="hidden">Hidden</option></select></label>
          <label className="sm:col-span-2 lg:col-span-4"><Label>Description</Label><textarea name="description" defaultValue={c.description} className="admin-input" rows={2} maxLength={1000} /></label>
          <label><Label>SEO title</Label><input name="seoTitle" defaultValue={c.seoTitle} className="admin-input" maxLength={120} /></label>
          <label className="sm:col-span-2"><Label>Meta description</Label><input name="metaDescription" defaultValue={c.metaDescription} className="admin-input" maxLength={300} /></label>
          <label><Label>Display order</Label><input name="sort" type="number" defaultValue={c.sort} className="admin-input" /></label>
          <div className="sm:col-span-2 lg:col-span-4"><button className="admin-btn">Save category</button></div>
        </form>
        <form action={uploadCategoryImageAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4">
          <input type="hidden" name="id" value={c.id} />
          <label className="min-w-0 flex-1"><Label>Upload category image (JPG, PNG or WebP; max 6 MB)</Label><input type="file" name="image" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm" /></label>
          <button className="admin-btn-ghost">Upload and use image</button>
        </form>
      </section>)}
    </div>
  </div>;
}
