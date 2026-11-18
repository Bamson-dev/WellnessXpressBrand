import { requireAdmin } from "@/lib/auth";
import { getBank, getContact, getSetting } from "@/lib/settings";
import { saveBankAction, saveContactAction, saveContentAction } from "@/app/admin/actions";
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
