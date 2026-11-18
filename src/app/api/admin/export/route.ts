import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";
import { FULFILMENT_STATUS, PAYMENT_STATUS } from "@/lib/site";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  if (!(await currentAdmin())) return new Response("Not found", { status: 404 });
  const orders = db().prepare("SELECT * FROM orders ORDER BY id DESC").all();
  const items = db().prepare("SELECT order_id, name, variant_label, qty, unit_price FROM order_items ORDER BY id").all();
  const byOrder = new Map<number, string[]>();
  for (const i of items) {
    const k = Number(i.order_id);
    byOrder.set(k, [...(byOrder.get(k) || []), `${i.qty} x ${i.name} (${i.variant_label}) @ ${i.unit_price}`]);
  }
  const head = ["Order number", "Date", "Customer", "Phone", "WhatsApp", "Email", "State", "City/LGA", "Address", "Items", "Subtotal", "Delivery fee", "Total",
    "Payment status", "Fulfilment status", "Payment reference", "Payer name", "Paid at", "Verified by", "Admin notes"];
  const rows = orders.map((o) => [o.number, o.created_at, o.customer_name, o.phone, o.whatsapp, o.email, o.state, o.city, o.address,
    (byOrder.get(Number(o.id)) || []).join("; "), o.subtotal, o.delivery_fee ?? "To be confirmed", o.total ?? "",
    PAYMENT_STATUS[String(o.payment_status)] || o.payment_status, FULFILMENT_STATUS[String(o.fulfilment_status)] || o.fulfilment_status,
    o.payment_reference, o.payer_name, o.paid_at || "", o.verified_by, o.admin_notes]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-orders-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
