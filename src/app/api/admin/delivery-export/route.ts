import { currentAdmin } from "@/lib/auth";
import { deliveryZones } from "@/lib/settings";

export const dynamic = "force-dynamic";
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Delivery settings as CSV. The same columns are accepted by the import. */
export async function GET() {
  const a = await currentAdmin();
  if (!a || a.role !== "owner") return new Response("Not found", { status: 404 });
  const rows = deliveryZones().map((z) => [z.state, z.active ? "yes" : "no", z.eta, z.note, z.internalNote]);
  const csv = "﻿" + [["State", "Enabled", "ETA", "Note", "Internal note"], ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-delivery-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
