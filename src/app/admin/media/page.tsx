import { requirePerm } from "@/lib/auth";
import { listMedia, mediaReferences } from "@/lib/media";
import { deleteMediaAction, libraryUploadAction, saveMediaMetaAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Media library" };

export default async function MediaPage(props: { searchParams: Promise<{ msg?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("media");
  const q = (searchParams.q || "").slice(0, 60);
  const items = listMedia(q);
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Media library</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">Uploaded images are stored on the server&apos;s persistent volume, so they survive restarts and redeployments. JPG, PNG and WebP up to 6 MB. An image that is used by a product or category cannot be deleted.</p>
      <form action={libraryUploadAction} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-4">
        <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className="w-full min-w-0 max-w-xs text-sm" aria-label="Images to upload" required />
        <button className="admin-btn">Upload</button>
      </form>
      <form className="mt-3 flex gap-2" action="/admin/media">
        <input name="q" defaultValue={q} placeholder="Search file name or alt text" className="admin-input max-w-xs" />
        <button className="admin-btn-ghost">Search</button>
      </form>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((m) => {
          const refs = mediaReferences(m.url);
          return (
            <article key={m.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt} className="aspect-square w-full rounded-lg bg-brand-50 object-contain" loading="lazy" />
              <p className="mt-2 truncate text-xs text-neutral-500" title={m.url}>{m.originalName || m.url}{m.bytes ? ` · ${Math.round(m.bytes / 1024)} KB` : ""}{m.builtin ? " · built-in" : ""}</p>
              <p className="text-xs text-neutral-600">{refs.count ? `Used by ${[...refs.products.map((p) => p.name), ...refs.categories.map((c) => c.name + " (category)"), ...refs.banners.map((b) => b.name + " (banner)")].join(", ")}` : "Not used"}</p>
              <form action={saveMediaMetaAction} className="mt-2 space-y-1">
                <input type="hidden" name="id" value={m.id} />
                <input name="alt" defaultValue={m.alt} placeholder="Alt text (what the image shows)" className="admin-input" aria-label="Alt text" />
                <input name="caption" defaultValue={m.caption} placeholder="Caption (optional)" className="admin-input" aria-label="Caption" />
                <button className="admin-btn-ghost w-full py-1.5">Save text</button>
              </form>
              {!m.builtin && !refs.count ? (
                <details className="mt-2 text-xs"><summary className="cursor-pointer text-red-700 underline">Delete</summary>
                  <form action={deleteMediaAction} className="mt-1"><input type="hidden" name="id" value={m.id} /><button className="font-semibold text-red-800 underline">Confirm permanent delete</button></form>
                </details>
              ) : null}
            </article>
          );
        })}
        {!items.length ? <p className="text-neutral-500">No images yet.</p> : null}
      </div>
    </div>
  );
}
