import { cookies } from "next/headers";
import { getOrderForCustomer } from "@/lib/orders";
import { ensureInvoice, invoiceFor, invoicePdf } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/** Customer PDF invoice. Needs the private order link token (query or the order cookie), like the order page. */
export async function GET(req: Request, { params }: { params: { number: string } }) {
  const token = new URL(req.url).searchParams.get("t") || (await cookies()).get(`wx_ot_${params.number}`)?.value || "";
  const o = getOrderForCustomer(params.number, token);
  if (!o) return new Response("Not found", { status: 404 });
  ensureInvoice(o.id, "customer");
  const inv = invoiceFor(o.id);
  if (!inv) return new Response("Not found", { status: 404 });
  const pdf = await invoicePdf(inv);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
}
