import { currentAdmin } from "@/lib/auth";
import { analyticsRange, salesAnalytics } from "@/lib/analytics";

const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
export async function GET(req: Request) {
  const admin = await currentAdmin();
  if (!admin || admin.role !== "owner") return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const range = analyticsRange(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined);
  const data = salesAnalytics(range);
  const lines = [["Report", "Period from", range.from, "Period to", range.to], ["Metric", "Name", "Units or orders", "Amount (NGN)"]];
  lines.push(["Summary", "Confirmed product revenue", "", String(data.summary.revenue || 0)]);
  lines.push(["Summary", "Delivery fees collected", "", String(data.summary.delivery_collected || 0)]);
  for (const row of data.products) lines.push(["Product", `${row.name} · ${row.variant_label}`, String(row.quantity), String(row.gross)]);
  for (const row of data.categories) lines.push(["Category", String(row.name), String(row.orders), String(row.gross)]);
  for (const row of data.states) lines.push(["State", String(row.state), String(row.orders), String(row.revenue)]);
  return new Response(lines.map((row) => row.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-sales-${range.from}-to-${range.to}.csv"`, "Cache-Control": "no-store" },
  });
}
