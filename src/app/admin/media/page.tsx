import path from "path";
import { promises as fs } from "fs";
import Link from "next/link";
import Image from "next/image";
import CopyMediaUrl from "@/components/admin/CopyMediaUrl";
import Flash from "@/components/admin/Flash";
import { assignExistingImageAction } from "@/app/admin/actions";
import { allProductsAdmin } from "@/lib/catalog";
import { requireAdmin } from "@/lib/auth";
import { MEDIA_DIR } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media library" };
type MediaEntry = { src: string; label: string };
const isImage = (name: string) => /\.(?:jpe?g|png|webp)$/i.test(name);

async function walk(dir: string, base: string): Promise<MediaEntry[]> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out: MediaEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(file, base));
    else if (entry.isFile() && isImage(entry.name)) {
      const rel = path.relative(base, file).split(path.sep).join("/");
      if (rel.startsWith("products/originals/")) continue;
      out.push({ src: `/images/${rel}`, label: `images/${rel}` });
    }
  }
  return out;
}

export default async function MediaLibrary({ searchParams }: { searchParams: { msg?: string; productId?: string } }) {
  await requireAdmin("owner");
  const products = allProductsAdmin();
  const publicFiles = await walk(path.join(process.cwd(), "public", "images"), path.join(process.cwd(), "public", "images"));
  let mediaFiles: MediaEntry[] = [];
  try {
    const files = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
    mediaFiles = files.filter((entry) => entry.isFile() && isImage(entry.name)).map((entry) => ({ src: `/media/${entry.name}`, label: `Uploaded · ${entry.name}` }));
  } catch { /* No uploaded media yet. */ }
  const files = [...publicFiles, ...mediaFiles].sort((a, b) => a.label.localeCompare(b.label));
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl">Media library</h1><p className="mt-1 text-sm text-neutral-600">Browse site artwork and uploaded images. Uploaded files are stored in persistent application data.</p></div>
      <Link href="/admin/products" className="admin-btn-ghost">Back to products</Link>
    </div>
    <div className="mt-4"><Flash msg={searchParams.msg} /></div>
    <p className="mt-3 text-xs text-neutral-500">{files.length} images · Files are not deleted when removed from a product, so other products and historical records keep their references.</p>
    {files.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((file) => <article key={file.src} className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-neutral-50"><Image src={file.src} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-contain" /></div>
        <p className="mt-2 break-all text-xs text-neutral-600">{file.label}</p>
        <div className="mt-2 flex items-center justify-between"><CopyMediaUrl src={file.src} /><a href={file.src} target="_blank" rel="noreferrer" className="text-xs text-neutral-600 underline">Preview</a></div>
        <form action={assignExistingImageAction} className="mt-2 space-y-2 border-t pt-2">
          <input type="hidden" name="src" value={file.src} />
          <label className="block text-xs font-medium text-neutral-600">Add to product
            <select name="productId" defaultValue={products.some((p) => String(p.id) === searchParams.productId) ? searchParams.productId : ""} className="admin-input mt-1" required>
              <option value="" disabled>Select a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <button className="admin-btn-ghost w-full py-1.5 text-xs">Add to gallery</button>
        </form>
      </article>)}
    </div> : <p className="mt-6 rounded-xl bg-white p-5 text-sm text-neutral-600">No image files were found.</p>}
  </div>;
}
