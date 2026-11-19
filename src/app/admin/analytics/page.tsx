import { requireAdmin } from "@/lib/auth";
import { analyticsRange, salesAnalytics } from "@/lib/analytics";
import { naira } from "@/lib/site";

export const metadata = { title: "Sales analytics" };

export default async function Analytics({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  await requireAdmin("owner");
  const range = analyticsRange(searchParams.from, searchParams.to);
  const data = salesAnalytics(range);
  const card = (label: string, value: string | number) => <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-sm text-neutral-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
  const table = (title: string, headers: string[], rows: Record<string, unknown>[], render: (row: Record<string, unknown>) => React.ReactNode) => <section className="rounded-xl border border-neutral-200 bg-white p-4"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-neutral-600"><tr>{headers.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i} className="border-t border-neutral-100">{render(row)}</tr>) : <tr><td colSpan={headers.length} className="p-3 text-neutral-500">No sales in this period.</td></tr>}</tbody></table></div></section>;
  const cell = (value: React.ReactNode, align = "") => <td className={`p-2 ${align}`}>{value}</td>;
  const summary = data.summary;
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl">Sales analytics</h1><p className="mt-1 text-sm text-neutral-600">Revenue includes product payments verified in the bank. Delivery fees are counted separately only after delivery payment is verified. Cancelled and unpaid orders are excluded.</p></div><a href={`/api/admin/analytics/export?from=${range.from}&to=${range.to}`} className="admin-btn-ghost">Export reports CSV</a></div>
    <form action="/admin/analytics" className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-3"><label className="text-xs font-semibold text-neutral-600">From<input type="date" name="from" defaultValue={range.from} className="admin-input mt-1" /></label><label className="text-xs font-semibold text-neutral-600">To<input type="date" name="to" defaultValue={range.to} className="admin-input mt-1" /></label><button className="admin-btn">Apply dates</button></form>
    <p className="mt-3 text-xs text-neutral-500">Reporting period: {range.from} to {range.to} (UTC dates).</p>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{card("Orders", Number(summary.total || 0))}{card("Paid orders", Number(summary.paid || 0))}{card("Pending", Number(summary.pending || 0) + Number(summary.awaiting || 0))}{card("Cancelled", Number(summary.cancelled || 0))}{card("Delivered", Number(summary.completed || 0))}{card("Confirmed product revenue", naira(Number(summary.revenue || 0)))}{card("Average paid order", naira(Number(summary.avgOrderValue || 0)))}{card("Delivery fees collected", naira(Number(summary.delivery_collected || 0)))}{card("Total collected", naira(summary.total_collected))}{card("Coupon discounts given", naira(summary.discounts))}{card("Product payments not yet confirmed", naira(summary.pending_amount))}{card("Delivery fees not yet paid", naira(summary.delivery_pending))}</div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      {table("Sales by product", ["Product / option", "Units", "Line sales"], data.products, (r) => <>{cell(<>{String(r.name)}<span className="block text-xs text-neutral-500">{String(r.variant_label)}</span></>)}{cell(Number(r.quantity))}{cell(naira(Number(r.gross)), "text-right")}</>)}
      {table("Sales by category", ["Category", "Paid orders", "Line sales"], data.categories, (r) => <>{cell(String(r.name))}{cell(Number(r.orders))}{cell(naira(Number(r.gross)), "text-right")}</>)}
      {table("Paid sales by state", ["State", "Paid orders", "Product revenue", "Delivery collected"], data.states, (r) => <>{cell(String(r.state))}{cell(Number(r.orders))}{cell(naira(Number(r.revenue)), "text-right")}{cell(naira(Number(r.delivery_collected)), "text-right")}</>)}
    </div>
  </div>;
}
