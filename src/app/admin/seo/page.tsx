import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { DESC_MAX, TITLE_MAX, getSeo, seoIssues } from "@/lib/seo";
import { listMedia } from "@/lib/media";
import { saveItemSeoAction, saveRedirectAction, saveSeoGlobalAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "SEO" };

export default async function Seo(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("seo");
  const seo = getSeo();
  const issues = seoIssues();
  const media = listMedia();
  const products = db().prepare("SELECT id, name, slug, status, seo_title, meta_description, og_image, noindex, short_description FROM products WHERE status != 'archived' ORDER BY sort, id").all();
  const cats = db().prepare("SELECT id, name, slug, status, seo_title, meta_description, noindex, description FROM categories ORDER BY sort, id").all();
  const redirects = db().prepare("SELECT * FROM redirects ORDER BY created_at DESC").all();
  const moved = db().prepare("SELECT * FROM product_redirects ORDER BY created_at DESC").all();
  const count = (v: unknown, max: number) => { const n = String(v || "").length; return <span className={`text-xs ${n > max ? "text-red-700" : "text-neutral-500"}`}>{n}/{max}</span>; };
  return (
    <div className="space-y-8">
      <div><Flash msg={searchParams.msg} />
        <h1 className="text-2xl">SEO</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">Titles and descriptions for search results and social sharing. Blank fields use sensible defaults from the product or category. The sitemap (/sitemap.xml) and robots.txt update automatically, and pages hidden from search are left out of the sitemap.</p>
        {seo.noindexSite ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">Search engines are currently asked not to index the store.</p> : null}
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg">Checks ({issues.length})</h2>
        {issues.length ? <ul className="mt-2 space-y-1 text-sm">{issues.map((x, i) => <li key={i}><a href={x.href} className="font-semibold text-brand-700 underline">{x.where}</a>: {x.problem}</li>)}</ul> : <p className="mt-2 text-sm text-brand-800">No problems found.</p>}
      </section>

      <form action={saveSeoGlobalAction} className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-lg sm:col-span-2">Site and homepage</h2>
        <label className="text-xs font-semibold text-neutral-600">Title template (%s is the page title)<input name="titleTemplate" defaultValue={seo.titleTemplate} maxLength={80} required className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Homepage title {count(seo.homeTitle, TITLE_MAX)}<input name="homeTitle" defaultValue={seo.homeTitle} maxLength={90} required className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Homepage description {count(seo.homeDescription, DESC_MAX)}<textarea name="homeDescription" defaultValue={seo.homeDescription} maxLength={300} rows={2} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Default description for other pages {count(seo.defaultDescription, DESC_MAX)}<textarea name="defaultDescription" defaultValue={seo.defaultDescription} maxLength={300} rows={2} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Social sharing image<select name="ogImage" defaultValue={seo.ogImage} className="admin-input mt-1"><option value="/og.jpg">Standard store image</option>{media.map((m) => <option key={m.id} value={m.url}>{m.originalName || m.url}</option>)}</select></label>
        <label className="flex min-h-10 items-center gap-2 self-end text-sm text-red-800"><input type="checkbox" name="noindexSite" defaultChecked={seo.noindexSite} className="h-4 w-4" /> Hide the whole store from search engines</label>
        <button className="admin-btn w-fit">Save site SEO</button>
      </form>

      <section>
        <h2 className="text-lg">Products</h2>
        <div className="mt-2 space-y-3">{products.map((p) => (
          <form key={String(p.id)} id={`p-${p.id}`} action={saveItemSeoAction} className="grid scroll-mt-28 gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
            <input type="hidden" name="kind" value="product" /><input type="hidden" name="id" value={String(p.id)} />
            <p className="font-semibold sm:col-span-2">{String(p.name)} <span className="font-normal text-neutral-500">/product/{String(p.slug)} · {String(p.status)}</span></p>
            <label className="text-xs font-semibold text-neutral-600">Title {count(p.seo_title || p.name, TITLE_MAX)}<input name="seoTitle" defaultValue={String(p.seo_title)} placeholder={String(p.name)} maxLength={90} className="admin-input mt-1" /></label>
            <label className="text-xs font-semibold text-neutral-600">Sharing image<select name="ogImage" defaultValue={String(p.og_image)} className="admin-input mt-1"><option value="">Main product photo</option>{media.map((m) => <option key={m.id} value={m.url}>{m.originalName || m.url}</option>)}</select></label>
            <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Description {count(p.meta_description, DESC_MAX)}<textarea name="metaDescription" defaultValue={String(p.meta_description)} placeholder={String(p.short_description)} maxLength={300} rows={2} className="admin-input mt-1" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={Number(p.noindex) === 1} className="h-4 w-4" /> Hide this product from search engines</label>
            <button className="admin-btn-ghost w-fit">Save</button>
          </form>
        ))}</div>
      </section>

      <section>
        <h2 className="text-lg">Categories</h2>
        <div className="mt-2 space-y-3">{cats.map((c) => (
          <form key={String(c.id)} id={`c-${c.id}`} action={saveItemSeoAction} className="grid scroll-mt-28 gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
            <input type="hidden" name="kind" value="category" /><input type="hidden" name="id" value={String(c.id)} />
            <p className="font-semibold sm:col-span-2">{String(c.name)} <span className="font-normal text-neutral-500">/category/{String(c.slug)} · {String(c.status)}</span></p>
            <label className="text-xs font-semibold text-neutral-600">Title {count(c.seo_title || c.name, TITLE_MAX)}<input name="seoTitle" defaultValue={String(c.seo_title)} placeholder={String(c.name)} maxLength={90} className="admin-input mt-1" /></label>
            <label className="text-xs font-semibold text-neutral-600">Description {count(c.meta_description, DESC_MAX)}<textarea name="metaDescription" defaultValue={String(c.meta_description)} placeholder={String(c.description)} maxLength={300} rows={2} className="admin-input mt-1" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={Number(c.noindex) === 1} className="h-4 w-4" /> Hide from search engines</label>
            <button className="admin-btn-ghost w-fit">Save</button>
          </form>
        ))}</div>
      </section>

      <section id="redirects" className="scroll-mt-28 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-lg">Redirects</h2>
        <p className="mt-1 text-sm text-neutral-600">Send an old address to a new one with a permanent (301) redirect. A redirect only applies when no page exists at the old address. Product address changes are redirected automatically.</p>
        <form action={saveRedirectAction} className="mt-3 flex flex-wrap gap-2">
          <input name="from" placeholder="/old-address" aria-label="Old address" required maxLength={200} className="admin-input max-w-xs" />
          <input name="to" placeholder="/new-address" aria-label="New address" required maxLength={300} className="admin-input max-w-xs" />
          <button className="admin-btn">Add redirect</button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">{redirects.map((r) => (
          <li key={String(r.from_path)} className="flex flex-wrap items-center gap-2">{String(r.from_path)} → {String(r.to_path)} <span className="text-neutral-500">({Number(r.hits)} visits)</span>
            <form action={saveRedirectAction}><input type="hidden" name="op" value="delete" /><input type="hidden" name="from" value={String(r.from_path)} /><button className="text-red-700 underline">Remove</button></form></li>
        ))}</ul>
        {moved.length ? <><h3 className="mt-4 text-sm font-semibold">Automatic product redirects</h3><ul className="mt-1 text-sm text-neutral-600">{moved.map((m) => <li key={String(m.old_slug)}>/product/{String(m.old_slug)} → /product/{String(m.new_slug)}</li>)}</ul></> : null}
      </section>
    </div>
  );
}
