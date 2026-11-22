import Link from "next/link";
import { can, requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { dashboardStats, listOrders } from "@/lib/orders";
import { allProductsAdmin } from "@/lib/catalog";
import { bankIsComplete, deliveryZones, getBank } from "@/lib/settings";
import { storageIsPersistent } from "@/lib/db";
import { FULFILMENT_STATUS, PAYMENT_STATUS, naira } from "@/lib/site";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Dashboard" };

export default async function Dashboard(props: { searchParams: Promise<{ denied?: string }> }) {
  const searchParams = await props.searchParams;
  const a = await requireAdmin();
  if (!can(a, "dashboard")) {
    const first = ADMIN_NAV.find((n) => n.href !== "/admin" && can(a, n.perm));
    if (!first) return <p className="rounded-xl border border-neutral-200 bg-white p-6 text-neutral-700">Your account has no permissions yet. Ask the store owner to give you access.</p>;
    redirect(searchParams.denied ? `${first.href}?msg=${encodeURIComponent("You do not have permission to open that page.")}` : first.href);
  }
  const st = dashboardStats();
  const recent = listOrders({ limit: 8 }).rows;
  const products = allProductsAdmin();
  const flagged = products.flatMap((p) => p.variants.filter((v) => v.needsConfirmation && v.status === "active").map((v) => `${p.name}: ${v.label}`));
  const zones = deliveryZones().filter((z) => z.active).length;
  const persistent = storageIsPersistent();
  const checks = [
    { ok: bankIsComplete(getBank()), t: "Bank details set", href: "/admin/settings" },
    { ok: zones > 0, t: zones ? `Delivery on for ${zones} of 37 locations` : "Delivery is switched off for every state. Customers cannot check out.", href: "/admin/delivery" },
    { ok: flagged.length === 0, t: flagged.length ? `${flagged.length} price option${flagged.length === 1 ? "" : "s"} still need confirmation` : "All prices confirmed", href: "/admin/products" },
    { ok: persistent !== false, t: persistent ? "Order data is on a persistent volume" : persistent === null ? "Could not check the data volume" : "DATA_DIR is NOT on a persistent volume. Orders would be lost on redeploy.", href: "" },
    { ok: process.env.COMING_SOON !== "true", t: process.env.COMING_SOON !== "true" ? "Store is live" : "Store is hidden behind Coming Soon (COMING_SOON=true is set in Coolify)", href: "" },
  ];
  const card = (label: string, value: string | number, href?: string, tone = "") => {
    const inner = (<><p className="text-sm text-neutral-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p></>);
    return href ? <Link href={href} className="rounded-xl border border-neutral-200 bg-white p-4 hover:border-brand-500">{inner}</Link> : <div className="rounded-xl border border-neutral-200 bg-white p-4">{inner}</div>;
  };
  return (
    <div>
      <Flash msg={searchParams.denied ? "You do not have permission to open that page." : undefined} />
      <h1 className="text-2xl">Dashboard</h1>
      <p className="text-sm text-neutral-500">Signed in as {a.email}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {card("Total orders", st.total, "/admin/orders")}
        {card("Awaiting verification", st.awaiting, "/admin/orders?payment=awaiting_verification", st.awaiting ? "text-amber-700" : "")}
        {card("Pending payment", st.pending, "/admin/orders?payment=pending_payment")}
        {card("Need delivery fee", st.awaitingFee, "/admin/orders?payment=awaiting_fee", st.awaitingFee ? "text-amber-700" : "")}
        {card("Delivery payment pending", st.awaitingDeliveryPayment, "/admin/orders?payment=awaiting_fee", st.awaitingDeliveryPayment ? "text-amber-700" : "")}
        {card("Verified payments", st.paid, "/admin/orders?payment=paid")}
        {card("Sales (paid)", naira(st.sales))}
        {card("Customers", st.customers, "/admin/customers")}
      </div>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg">Launch checklist</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {checks.map((c) => (
            <li key={c.t} className="flex items-start gap-2">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${c.ok ? "bg-brand-700" : "bg-amber-500"}`}>{c.ok ? "✓" : "!"}</span>
              {c.href ? <Link href={c.href} className="hover:underline">{c.t}</Link> : <span>{c.t}</span>}
            </li>
          ))}
        </ul>
        {flagged.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-amber-800">Prices waiting for confirmation</summary><ul className="mt-2 list-disc pl-5 text-neutral-700">{flagged.map((f) => <li key={f}>{f}</li>)}</ul></details> : null}
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between p-4"><h2 className="text-lg">Latest orders</h2><Link href="/admin/orders" className="text-sm font-semibold text-brand-700">All orders</Link></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Payment</th><th className="p-3">Fulfilment</th><th className="p-3">Date</th></tr></thead>
            <tbody>
              {recent.length ? recent.map((o) => (
                <tr key={o.id} className="border-t border-neutral-100">
                  <td className="p-3"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.number}</Link></td>
                  <td className="p-3">{o.customer_name}</td>
                  <td className="p-3">{o.total != null ? naira(o.total) : <span className="text-amber-700">Fee needed</span>}</td>
                  <td className="p-3">{PAYMENT_STATUS[o.payment_status]}</td>
                  <td className="p-3">{FULFILMENT_STATUS[o.fulfilment_status]}</td>
                  <td className="p-3 text-neutral-500">{o.created_at}</td>
                </tr>
              )) : <tr><td className="p-4 text-neutral-500" colSpan={6}>No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
