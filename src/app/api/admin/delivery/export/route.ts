import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function GET() {
  const admin = await currentAdmin();
  if (!admin || admin.role !== "owner") return new Response("Forbidden", { status: 403 });
  const zones = db().prepare("SELECT state,fee,active,estimated_delivery,note FROM delivery_zones ORDER BY state").all();
  const headers = ["state", "fee", "active", "estimated_delivery", "note"];
  const body = "\uFEFF" + [headers, ...zones.map((z) => [z.state, z.fee, Number(z.active) ? "yes" : "no", z.estimated_delivery, z.note])]
    .map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wellnessxpress-delivery-settings-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}

