import { requireAdmin } from "@/lib/auth";
import { getBank, getContact, getSetting } from "@/lib/settings";
import { saveBankAction, saveContactAction, saveContentAction, saveHomeContentAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const bank = getBank();
  const c = getContact();
  const L = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</span>;
  const content: [string, string, number][] = [
    ["announcement", "Announcement bar (top of every page)", 2], ["about", "About Us page", 8], ["productNotice", "Important product information", 5],
    ["shippingPolicy", "Shipping and Delivery page", 8], ["returnsPolicy", "Returns and Refunds page", 6], ["privacyPolicy", "Privacy Policy page", 8], ["termsPolicy", "Terms and Conditions page", 8],
  ];
  return (
    <div>
      <Flash msg={searchParams.msg} />
      <h1 className="text-2xl">Settings</h1>
      <form action={saveHomeContentAction} className="mt-4 space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg">Homepage hero and banner</h2>
        <p className="text-sm text-neutral-500">Text is rendered as plain text. Button links must be internal paths such as /shop. For a banner image, choose an existing /images or uploaded /media path.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><L>Hero eyebrow</L><input name="homeHeroEyebrow" defaultValue={getSetting<string>("homeHeroEyebrow")} className="admin-input" /></label>
          <label><L>Headline</L><input name="homeHeroTitle" defaultValue={getSetting<string>("homeHeroTitle")} className="admin-input" required /></label>
          <label><L>Headline accent</L><input name="homeHeroAccent" defaultValue={getSetting<string>("homeHeroAccent")} className="admin-input" required /></label>
          <label className="sm:col-span-2"><L>Description</L><textarea name="homeHeroDescription" defaultValue={getSetting<string>("homeHeroDescription")} rows={3} className="admin-input" required /></label>
          <label><L>Primary button</L><input name="homeHeroPrimaryLabel" defaultValue={getSetting<string>("homeHeroPrimaryLabel")} className="admin-input" required /></label>
          <label><L>Primary link</L><input name="homeHeroPrimaryHref" defaultValue={getSetting<string>("homeHeroPrimaryHref")} className="admin-input" required /></label>
          <label><L>Secondary button</L><input name="homeHeroSecondaryLabel" defaultValue={getSetting<string>("homeHeroSecondaryLabel")} className="admin-input" required /></label>
          <label><L>Secondary link</L><input name="homeHeroSecondaryHref" defaultValue={getSetting<string>("homeHeroSecondaryHref")} className="admin-input" required /></label>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="homeBannerEnabled" defaultChecked={getSetting<boolean>("homeBannerEnabled")} />Show promotional banner above the hero</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label><L>Banner title</L><input name="homeBannerTitle" defaultValue={getSetting<string>("homeBannerTitle")} className="admin-input" /></label>
            <label><L>Banner button (optional)</L><input name="homeBannerButton" defaultValue={getSetting<string>("homeBannerButton")} className="admin-input" /></label>
            <label><L>Banner link</L><input name="homeBannerHref" defaultValue={getSetting<string>("homeBannerHref")} className="admin-input" /></label>
            <label><L>Banner image path (optional)</L><input name="homeBannerImage" defaultValue={getSetting<string>("homeBannerImage")} placeholder="/images/banners/your-image.webp" className="admin-input" /></label>
            <label className="sm:col-span-2"><L>Banner text (optional)</L><textarea name="homeBannerBody" defaultValue={getSetting<string>("homeBannerBody")} rows={2} className="admin-input" /></label>
          </div>
        </div>
        <button className="admin-btn">Save homepage content</button>
      </form>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <form action={saveBankAction} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg">Bank transfer details</h2>
          <p className="text-sm text-neutral-500">Customers see these on their order page. Orders already placed keep a record of the details shown at the time.</p>
          <label className="block"><L>Bank</L><input name="bank" defaultValue={bank.bank} className="admin-input" required /></label>
          <label className="block"><L>Account name</L><input name="accountName" defaultValue={bank.accountName} className="admin-input" required /></label>
          <label className="block"><L>Account number (10 digits)</L><input name="accountNumber" defaultValue={bank.accountNumber} inputMode="numeric" className="admin-input" required /></label>
          <button className="admin-btn">Save bank details</button>
        </form>
        <form action={saveContactAction} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg">Contact details</h2>
          <label className="block"><L>WhatsApp number</L><input name="whatsapp" defaultValue={c.whatsapp} className="admin-input" required /></label>
          <label className="block"><L>Business email</L><input name="email" defaultValue={c.email} className="admin-input" /></label>
          <label className="block"><L>Instagram URL (optional)</L><input name="instagram" defaultValue={c.instagram} placeholder="https://" className="admin-input" /></label>
          <label className="block"><L>Facebook URL (optional)</L><input name="facebook" defaultValue={c.facebook} placeholder="https://" className="admin-input" /></label>
          <label className="block"><L>TikTok URL (optional)</L><input name="tiktok" defaultValue={c.tiktok} placeholder="https://" className="admin-input" /></label>
          <button className="admin-btn">Save contact details</button>
        </form>
      </div>
      <form action={saveContentAction} className="mt-5 space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg">Store text</h2>
        <p className="text-sm text-neutral-500">Leave a blank line between paragraphs. Only publish policies and claims you can stand behind.</p>
        {content.map(([k, label, rows]) => (
          <label key={k} className="block"><L>{label}</L><textarea name={k} defaultValue={getSetting<string>(k)} rows={rows} className="admin-input" /></label>
        ))}
        <button className="admin-btn">Save store text</button>
      </form>
    </div>
  );
}
