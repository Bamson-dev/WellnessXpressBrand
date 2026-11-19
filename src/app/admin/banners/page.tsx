import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { allBanners, bannerStatus } from "@/lib/banners";
import { getSetting } from "@/lib/settings";
import { bannerOpAction, saveHomeHeroAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Banners and homepage" };
type Hero = { title: string; accent: string; text: string; primaryLabel: string; primaryUrl: string; secondaryLabel: string; secondaryUrl: string };

export default async function Banners(props: { searchParams: Promise<{ msg?: string }> }) {
  const searchParams = await props.searchParams;
  await requirePerm("banners");
  const banners = allBanners();
  const hero = getSetting<Hero>("homeHero");
  const op = (id: number, o: string, label: string, cls = "admin-btn-ghost py-1") => <AdminForm action={bannerOpAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={o} /><button className={cls}>{label}</button></AdminForm>;
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Banners and homepage</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">&quot;Top&quot; banners show under the homepage hero. &quot;Promotion&quot; banners show after the combo sets. A banner shows only when it is switched on and today is inside its dates. The free delivery message always stays in the top bar and the hero.</p>
        </div>
        <Link href="/admin/banners/new" className="admin-btn">New banner</Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Banner</th><th className="p-3">Position</th><th className="p-3">Dates</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {banners.length ? banners.map((b) => (
              <tr key={b.id} className="border-t border-neutral-100 align-top">
                <td className="p-3"><Link href={`/admin/banners/${b.id}`} className="font-semibold text-brand-700 underline">{b.heading || `Banner #${b.id}`}</Link>{b.desktopImage ? <span className="block text-xs text-neutral-500">{b.desktopImage}</span> : null}</td>
                <td className="p-3">{b.placement === "hero" ? "Top" : "Promotion"} · {b.sort}</td>
                <td className="p-3 text-neutral-600">{b.startsAt || "Any time"} → {b.endsAt || "no end"}</td>
                <td className="p-3">{bannerStatus(b)}</td>
                <td className="flex flex-wrap gap-1 p-3">
                  {op(b.id, "toggle", b.active ? "Switch off" : "Switch on")}{op(b.id, "up", "↑")}{op(b.id, "down", "↓")}{op(b.id, "duplicate", "Duplicate")}
                  <a href={`/?bannerPreview=${b.id}`} target="_blank" rel="noopener" className="admin-btn-ghost py-1">Preview</a>
                  <details><summary className="cursor-pointer px-2 py-1 text-red-700 underline">Delete</summary>
                    <AdminForm action={bannerOpAction} className="mt-1 space-y-1"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="op" value="delete" /><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="confirm" value="yes" required /> Yes, delete</label><button className="admin-btn-danger py-1">Delete banner</button></AdminForm>
                  </details>
                </td>
              </tr>
            )) : <tr><td colSpan={5} className="p-4 text-neutral-500">No banners yet. The homepage shows its standard layout.</td></tr>}
          </tbody>
        </table>
      </div>

      <AdminForm action={saveHomeHeroAction} className="mt-6 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-lg sm:col-span-2">Homepage hero text</h2>
        <label className="text-xs font-semibold text-neutral-600">Heading<input name="title" defaultValue={hero.title} maxLength={80} required className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Highlighted words (green)<input name="accent" defaultValue={hero.accent} maxLength={60} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Text<textarea name="text" defaultValue={hero.text} maxLength={300} rows={2} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Main button text<input name="primaryLabel" defaultValue={hero.primaryLabel} maxLength={40} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Main button link<input name="primaryUrl" defaultValue={hero.primaryUrl} maxLength={200} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Second button text<input name="secondaryLabel" defaultValue={hero.secondaryLabel} maxLength={40} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Second button link<input name="secondaryUrl" defaultValue={hero.secondaryUrl} maxLength={200} className="admin-input mt-1" /></label>
        <button className="admin-btn w-fit">Save homepage text</button>
      </AdminForm>
    </div>
  );
}
