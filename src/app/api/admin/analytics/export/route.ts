import { can, currentAdmin } from "@/lib/auth";
import { analyticsRange, salesAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const csv = (value: unknown) => {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+$/.test(v)) v = "'" + v; // stop spreadsheet formula injection
  return `"${v.replace(/"/g, '""')}"`;
};
export async function GET(req: Request) {
  const admin = await currentAdmin();
  if (!can(admin, "reports")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const range = analyticsRange(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined);
  const data = salesAnalytics(range);
  const lines = [["Report", "Period from", range.from, "Period to", range.to], ["Metric", "Name", "Units or orders", "Amount (NGN)"]];
  lines.push(["Summary", "Confirmed product revenue", "", String(data.summary.revenue || 0)]);
  lines.push(["Summary", "Delivery fees collected", "", String(data.summary.delivery_collected || 0)]);
  lines.push(["Summary", "Total collected", "", String(data.summary.total_collected)]);
  lines.push(["Summary", "Coupon discounts given", "", String(data.summary.discounts)]);
  lines.push(["Summary", "Product payments not yet confirmed", "", String(data.summary.pending_amount)]);
  lines.push(["Summary", "Delivery fees not yet paid", "", String(data.summary.delivery_pending)]);
  lines.push(["Summary", "Paid orders", String(data.summary.paid), ""]);
  lines.push(["Summary", "Cancelled orders", String(data.summary.cancelled), ""]);
  lines.push(["Summary", "Delivered orders", String(data.summary.completed), ""]);
  lines.push(["Summary", "Average paid order", "", String(data.summary.avgOrderValue)]);
  for (const row of data.products) lines.push(["Product", `${row.name} · ${row.variant_label}`, String(row.quantity), String(row.gross)]);
  for (const row of data.categories) lines.push(["Category", String(row.name), String(row.orders), String(row.gross)]);
  for (const row of data.states) lines.push(["State", String(row.state), String(row.orders), String(row.revenue)]);
  lines.push(["Summary", "Paying customers", String(data.customers), ""]);
  for (const row of data.coupons) lines.push(["Coupon", String(row.code), String(row.paid_orders), String(row.discount)]);
  for (const row of data.inventory) lines.push(["Inventory", `${row.name} · ${row.label}`, String(row.sold), row.stock == null ? "not tracked" : `stock ${row.stock}`]);
  return new Response(lines.map((row) => row.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-sales-${range.from}-to-${range.to}.csv"`, "Cache-Control": "no-store" },
  });
}
