import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { allProductsAdmin, getCategories } from "@/lib/catalog";
import { deleteCouponAction, saveCouponAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Promotions and coupons" };
const Field = ({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) => <label className="block text-xs font-semibold text-neutral-600">{label}<input name={name} className="admin-input mt-1" {...props} /></label>;
function csvValues(raw: unknown) { try { const x = JSON.parse(String(raw || "[]")); return Array.isArray(x) ? x.join(", ") : ""; } catch { return ""; } }

export default async function Promotions({ searchParams }: { searchParams: { msg?: string } }) {
  await requireAdmin("owner");
  const coupons = db().prepare("SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id) uses FROM coupons c ORDER BY c.id DESC").all();
  const products = allProductsAdmin();
  const categories = getCategories(true);
  const editor = (coupon?: Record<string, unknown>) => <form action={saveCouponAction} className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
    {coupon ? <input type="hidden" name="id" value={String(coupon.id)} /> : null}
    <Field label="Code" name="code" defaultValue={String(coupon?.code || "")} placeholder="WELCOME10" required maxLength={40} />
    <label className="block text-xs font-semibold text-neutral-600">Discount type<select name="discountType" defaultValue={String(coupon?.discount_type || "percent")} className="admin-input mt-1"><option value="percent">Percentage</option><option value="fixed">Fixed amount (₦)</option></select></label>
    <Field label="Discount value" name="discountValue" type="number" min={1} max={100000000} defaultValue={String(coupon?.discount_value ?? "")} required />
    <Field label="Minimum product subtotal (₦)" name="minimumOrder" type="number" min={0} defaultValue={String(coupon?.minimum_order ?? 0)} />
    <Field label="Starts on (optional)" name="startsAt" type="date" defaultValue={String(coupon?.starts_at || "")} />
    <Field label="Expires on (optional)" name="expiresAt" type="date" defaultValue={String(coupon?.expires_at || "")} />
    <Field label="Total uses (blank = unlimited)" name="usageLimit" type="number" min={1} defaultValue={coupon?.usage_limit == null ? "" : String(coupon.usage_limit)} />
    <Field label="Uses per customer" name="customerLimit" type="number" min={1} max={1000} defaultValue={String(coupon?.customer_limit ?? 1)} required />
    <Field label="Restricted product IDs (comma separated; blank = all)" name="productIds" defaultValue={csvValues(coupon?.product_ids)} placeholder={products.slice(0,2).map((p)=>p.id).join(", ")} />
    <Field label="Restricted category slugs (comma separated; blank = all)" name="categorySlugs" defaultValue={csvValues(coupon?.category_slugs)} placeholder={categories.slice(0,2).map((c)=>c.slug).join(", ")} />
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={coupon ? Number(coupon.active) === 1 : false} className="h-4 w-4 accent-brand-700" /> Active</label>
    <button className="admin-btn w-fit">{coupon ? "Save coupon" : "Create coupon"}</button>
  </form>;
  return <div>
    <Flash msg={searchParams.msg} />
    <h1 className="text-2xl">Promotions and coupons</h1>
    <p className="mt-1 max-w-3xl text-sm text-neutral-600">A coupon discounts eligible product lines only; delivery stays separate. Checkout validates the code and limits again on the server. Product IDs and category slugs define optional eligible items; when both are set, either restriction can qualify a line.</p>
    <section className="mt-4"><h2 className="mb-2 text-lg font-semibold">Create coupon</h2>{editor()}</section>
    <section className="mt-6"><h2 className="mb-2 text-lg font-semibold">Existing coupons ({coupons.length})</h2><div className="space-y-4">{coupons.map((coupon) => <article key={String(coupon.id)} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold">{String(coupon.code)} · {Number(coupon.active) ? "Active" : "Inactive"} · {Number(coupon.uses)} redemption{Number(coupon.uses) === 1 ? "" : "s"}</p><form action={deleteCouponAction}><input type="hidden" name="id" value={String(coupon.id)} /><button className="text-red-700 underline">{Number(coupon.uses) ? "Deactivate and preserve history" : "Delete coupon"}</button></form></div>{editor(coupon)}</article>)}</div></section>
  </div>;
}
