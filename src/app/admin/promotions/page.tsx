import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { allProductsAdmin, getCategories } from "@/lib/catalog";
import { deleteCouponAction, saveCouponAction } from "@/app/admin/actions";
import Flash from "@/components/admin/Flash";
import ProductPicker from "@/components/admin/ProductPicker";

export const metadata = { title: "Promotions and coupons" };
const Field = ({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) => <label className="block text-xs font-semibold text-neutral-600">{label}<input name={name} className="admin-input mt-1" {...props} /></label>;
function csvValues(raw: unknown) { try { const x = JSON.parse(String(raw || "[]")); return Array.isArray(x) ? x.join(", ") : ""; } catch { return ""; } }

function CouponUsage({ id, code }: { id: number; code: string }) {
  const rows = db().prepare(`SELECT o.id, o.number, o.customer_name, o.created_at, o.discount_amount, o.payment_status, o.fulfilment_status,
    EXISTS(SELECT 1 FROM coupon_redemptions r WHERE r.order_id = o.id AND r.coupon_id = ?) counted
    FROM orders o WHERE o.coupon_code = ? ORDER BY o.id DESC LIMIT 100`).all(id, code);
  if (!rows.length) return null;
  return <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">Usage history ({rows.length})</summary><ul className="mt-1 space-y-1">{rows.map((r) => <li key={String(r.id)}><a href={`/admin/orders/${r.id}`} className="text-brand-700 underline">{String(r.number)}</a> · {String(r.customer_name)} · −₦{Number(r.discount_amount).toLocaleString("en-NG")} · {String(r.created_at).slice(0, 10)} · {r.fulfilment_status === "cancelled" ? "cancelled (use released)" : r.payment_status === "paid" ? "paid" : "unpaid"}{Number(r.counted) ? "" : " · not counted"}</li>)}</ul></details>;
}

export default async function Promotions({ searchParams }: { searchParams: { msg?: string } }) {
  await requirePerm("coupons");
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
    <ProductPicker name="productIds" label="Limit to these products (optional)" emptyText="All products" initial={csvValues(coupon?.product_ids).split(", ").filter(Boolean)} items={products.map((p) => ({ id: String(p.id), label: p.name, hint: p.status === "published" ? "" : ` (${p.status})` }))} />
    <ProductPicker name="categorySlugs" label="Or limit to these categories (optional)" emptyText="All categories" initial={csvValues(coupon?.category_slugs).split(", ").filter(Boolean)} items={categories.map((c) => ({ id: c.slug, label: c.name }))} />
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={coupon ? Number(coupon.active) === 1 : false} className="h-4 w-4 accent-brand-700" /> Active</label>
    <button className="admin-btn w-fit">{coupon ? "Save coupon" : "Create coupon"}</button>
  </form>;
  return <div>
    <Flash msg={searchParams.msg} />
    <h1 className="text-2xl">Promotions and coupons</h1>
    <p className="mt-1 max-w-3xl text-sm text-neutral-600">A coupon discounts eligible product lines only; delivery stays separate. Checkout validates the code and limits again on the server. Product IDs and category slugs define optional eligible items; when both are set, either restriction can qualify a line.</p>
    <section className="mt-4"><h2 className="mb-2 text-lg font-semibold">Create coupon</h2>{editor()}</section>
    <section className="mt-6"><h2 className="mb-2 text-lg font-semibold">Existing coupons ({coupons.length})</h2><div className="space-y-4">{coupons.map((coupon) => <article key={String(coupon.id)} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold">{String(coupon.code)} · {Number(coupon.active) ? "Active" : "Inactive"} · {Number(coupon.uses)} redemption{Number(coupon.uses) === 1 ? "" : "s"}</p><form action={deleteCouponAction}><input type="hidden" name="id" value={String(coupon.id)} /><button className="text-red-700 underline">{Number(coupon.uses) ? "Deactivate and preserve history" : "Delete coupon"}</button></form></div>{editor(coupon)}<CouponUsage id={Number(coupon.id)} code={String(coupon.code)} /></article>)}</div></section>
  </div>;
}
