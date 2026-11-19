import { can, currentAdmin } from "@/lib/auth";
import { ensureInvoice, invoiceFor, invoicePdf } from "@/lib/invoices";
import { logAdminActivity } from "@/lib/admin-events";

export const dynamic = "force-dynamic";

/** Admin PDF download. Creates the invoice number the first time it is requested. */
export async function GET(_: Request, props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params;
  const a = await currentAdmin();
  if (!can(a, "invoices")) return new Response("Not found", { status: 404 });
  const id = Number(params.orderId);
  if (!Number.isSafeInteger(id) || id < 1) return new Response("Not found", { status: 404 });
  const created = ensureInvoice(id, a!.email);
  const inv = created ? invoiceFor(id) : null;
  if (!inv) return new Response("Not found", { status: 404 });
  logAdminActivity(a!.email, "download_invoice", "invoice", inv.number, inv.order.number);
  const pdf = await invoicePdf(inv);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
