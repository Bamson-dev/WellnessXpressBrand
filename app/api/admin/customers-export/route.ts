import { can, currentAdmin } from "@/lib/auth";
import { allCustomersForExport } from "@/lib/customers";
import { logAdminActivity } from "@/lib/admin-events";

export const dynamic = "force-dynamic";
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Customer list export. Needs both Customers and Reports permissions because it contains personal data. */
export async function GET() {
  const a = await currentAdmin();
  if (!can(a, "customers") || !can(a, "reports")) return new Response("Not found", { status: 404 });
  const rows = allCustomersForExport();
  const head = ["Name", "Phone", "Email", "State", "Orders", "Paid orders", "Confirmed payments (NGN)", "Outstanding (NGN)", "First order", "Last order"];
  const csv = "﻿" + [head, ...rows.map((r) => [r.name, r.phone, r.email, r.state, r.orders, r.paid_orders, r.confirmed, r.outstanding, r.first_order, r.last_order])].map((r) => r.map(cell).join(",")).join("\r\n");
  logAdminActivity(a!.email, "export_customers", "customers", "", `${rows.length} rows`);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-customers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
