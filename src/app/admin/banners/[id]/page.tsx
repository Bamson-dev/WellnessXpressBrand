import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { bannerStatus, getBanner } from "@/lib/banners";
import { listMedia } from "@/lib/media";
import { saveBannerAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import UnsavedGuard from "@/components/admin/UnsavedGuard";

export const metadata = { title: "Banner" };

export default async function BannerEdit(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requirePerm("banners");
  const isNew = params.id === "new";
  const b = isNew ? null : getBanner(Number(params.id));
  if (!isNew && !b) notFound();
  const media = listMedia();
  const pick = (name: string, value: string, label: string) => (
    <label className="text-xs font-semibold text-neutral-600">{label}
      <select name={name} defaultValue={value} className="admin-input mt-1"><option value="">None</option>{media.map((m) => <option key={m.id} value={m.url}>{m.originalName || m.url}{m.alt ? ` · ${m.alt}` : ""}</option>)}</select>
    </label>
  );
  return (
    <div>
      <Link href="/admin/banners" className="text-sm font-semibold text-brand-700">← Banners</Link>
      <h1 className="mt-2 text-2xl">{isNew ? "New banner" : b!.heading || `Banner #${b!.id}`}</h1>
      {b ? <p className="text-sm text-neutral-500">{bannerStatus(b)} · <a href={`/?bannerPreview=${b.id}`} target="_blank" rel="noopener" className="text-brand-700 underline">Preview on the homepage</a></p> : null}
      <div className="mt-3"><Flash msg={searchParams.msg} /></div>
      <form id="banner-form" action={saveBannerAction} className="mt-2 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
        <UnsavedGuard formId="banner-form" />
        {b ? <input type="hidden" name="id" value={b.id} /> : null}
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Heading<input name="heading" defaultValue={b?.heading} maxLength={120} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Description<textarea name="description" defaultValue={b?.description} maxLength={400} rows={3} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Button text<input name="buttonText" defaultValue={b?.buttonText} maxLength={40} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Button link (/shop, /product/..., or https://...)<input name="buttonUrl" defaultValue={b?.buttonUrl} maxLength={300} className="admin-input mt-1" /></label>
        {pick("desktopImage", b?.desktopImage || "", "Desktop image (from media library)")}
        <label className="text-xs font-semibold text-neutral-600">Or upload a desktop image<input type="file" name="desktopFile" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
        {pick("mobileImage", b?.mobileImage || "", "Mobile image (optional)")}
        <label className="text-xs font-semibold text-neutral-600">Or upload a mobile image<input type="file" name="mobileFile" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" /></label>
        <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Image description (alt text)<input name="imageAlt" defaultValue={b?.imageAlt} maxLength={160} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Position<select name="placement" defaultValue={b?.placement || "promo"} className="admin-input mt-1"><option value="hero">Top (under the hero)</option><option value="promo">Promotion (after combo sets)</option></select></label>
        <label className="flex min-h-10 items-center gap-2 self-end text-sm"><input type="checkbox" name="active" defaultChecked={b?.active ?? false} className="h-4 w-4 accent-brand-700" /> Switched on</label>
        <label className="text-xs font-semibold text-neutral-600">Show from (optional)<input type="date" name="startsAt" defaultValue={b?.startsAt} className="admin-input mt-1" /></label>
        <label className="text-xs font-semibold text-neutral-600">Show until (optional)<input type="date" name="endsAt" defaultValue={b?.endsAt} className="admin-input mt-1" /></label>
        <button className="admin-btn w-fit">{isNew ? "Create banner" : "Save banner"}</button>
      </form>
    </div>
  );
}
