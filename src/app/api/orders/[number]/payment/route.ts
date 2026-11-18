import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { db, RECEIPT_DIR } from "@/lib/db";
import { getOrderForCustomer, logEvent } from "@/lib/orders";
import { clean, sniffType } from "@/lib/validate";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const MAX = 5 * 1024 * 1024;

/**
 * Customer payment confirmation. This only moves an order to "Awaiting Verification".
 * A receipt or reference never marks an order paid; an admin must verify the money in the bank account.
 */
export async function POST(req: Request, { params }: { params: { number: string } }) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("pc:" + ipOf(req), 8)) return Response.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid request." }, { status: 400 });
  const order = getOrderForCustomer(params.number, clean(form.get("t"), 80));
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  if (!["pending_payment", "payment_failed", "awaiting_verification"].includes(order.payment_status) || order.fulfilment_status === "cancelled")
    return Response.json({ error: "This order is not waiting for payment." }, { status: 409 });

  const payerName = clean(form.get("payerName"), 100);
  const reference = clean(form.get("reference"), 100);
  const note = clean(form.get("note"), 500);
  const errors: Record<string, string> = {};
  if (payerName.length < 2) errors.payerName = "Enter the name on the account you paid from.";

  let receiptPath = "";
  const file = form.get("receipt");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX) errors.receipt = "The receipt must be 5 MB or smaller.";
    else {
      const buf = Buffer.from(await file.arrayBuffer());
      const type = sniffType(buf);
      if (!type) errors.receipt = "Upload a JPG, PNG, WebP or PDF file.";
      else {
        const name = `${order.number}-${randomBytes(6).toString("hex")}.${type}`;
        await fs.mkdir(RECEIPT_DIR, { recursive: true });
        await fs.writeFile(path.join(RECEIPT_DIR, name), buf, { mode: 0o600 });
        receiptPath = name;
      }
    }
  }
  if (!reference && !receiptPath && !errors.receipt) errors.reference = "Enter the transfer reference or upload your receipt.";
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });

  db().prepare(
    `UPDATE orders SET payment_status = 'awaiting_verification', payer_name = ?, payment_reference = ?, payment_note = ?,
     receipt_path = CASE WHEN ? != '' THEN ? ELSE receipt_path END, payment_submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(payerName, reference, note, receiptPath, receiptPath, order.id);
  logEvent(order.id, "customer", "payment_confirmation_submitted", [reference && "Ref: " + reference, receiptPath && "Receipt uploaded"].filter(Boolean).join(". "));
  return Response.json({ ok: true });
}
