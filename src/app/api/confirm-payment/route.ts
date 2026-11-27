import path from "path";
import { promises as fs } from "fs";
import { createHash, randomBytes } from "crypto";
import { RECEIPT_DIR } from "@/lib/db";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { getOrderByNumber } from "@/lib/orders";
import { clean, sniffType } from "@/lib/validate";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";
import { NIGERIAN_STATES, normalisePhone } from "@/lib/site";
import { notifyAdmin } from "@/lib/admin-events";

export const dynamic = "force-dynamic";
const MAX = 5 * 1024 * 1024;
const cookie = (req: Request, name: string) => {
  const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]+)").exec(req.headers.get("cookie") || "");
  return m ? decodeURIComponent(m[1]).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 200) : "";
};

/**
 * Payment confirmation and delivery details from a customer who already paid.
 * A submission is stored as "awaiting_verification". Nothing here marks money as received or sends a Purchase to Meta.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("cp:" + ipOf(req), 6)) return Response.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (clean(form.get("website"), 50)) return Response.json({ ok: true }); // honeypot

  const name = clean(form.get("fullName"), 100);
  const phone = clean(form.get("phone"), 25);
  const address = clean(form.get("address"), 400);
  const state = clean(form.get("state"), 40);
  const amount = Number(String(form.get("amount") ?? "").replace(/[₦,\s]/g, ""));
  const orderReference = clean(form.get("orderReference"), 20).toUpperCase().replace(/\s/g, "");
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.fullName = "Enter your full name.";
  if (!/^\+?[0-9\s-]{10,16}$/.test(phone) || phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid WhatsApp number.";
  if (!Number.isInteger(amount) || amount < 1000 || amount > 10_000_000) errors.amount = "Enter the amount you paid in naira.";
  if (address.length < 8) errors.address = "Enter your full delivery address.";
  if (!(NIGERIAN_STATES as readonly string[]).includes(state)) errors.state = "Select your state.";

  // Order reference: required, and validated against the real order on the server. The amount and the
  // phone number must match that order — client-supplied amounts are never trusted on their own.
  let matchedOrder: ReturnType<typeof getOrderByNumber> = null;
  if (!/^WX\d{6}-[A-Z0-9]{5}$/.test(orderReference)) {
    errors.orderReference = "Enter your order number, for example WX251126-ABCDE. It is shown on your order page.";
  } else {
    matchedOrder = getOrderByNumber(orderReference);
    if (!matchedOrder) errors.orderReference = "We could not find that order number. Check it and try again, or message us on WhatsApp.";
    else if (matchedOrder.fulfilment_status === "cancelled") errors.orderReference = "That order is cancelled. Message us on WhatsApp so we can help.";
    else if (matchedOrder.payment_status === "paid") errors.orderReference = "Payment for that order is already confirmed. You do not need to submit this form again.";
    else {
      const expected = Number(matchedOrder.total ?? matchedOrder.subtotal);
      if (!errors.amount && amount !== expected) errors.amount = "The amount does not match this order. Enter the exact total shown on your order page.";
      if (!errors.phone && normalisePhone(phone) !== normalisePhone(String(matchedOrder.phone))) errors.phone = "Use the same WhatsApp number you placed the order with.";
    }
  }

  const file = form.get("receipt");
  let buf: Buffer | null = null;
  let type: string | null = null;
  if (!file || typeof file === "string" || file.size === 0) errors.receipt = "Upload your payment receipt.";
  else if (file.size > MAX) errors.receipt = "The receipt must be 5 MB or smaller.";
  else {
    buf = Buffer.from(await file.arrayBuffer());
    type = sniffType(buf);
    if (!type || type === "webp") errors.receipt = "Upload a JPG, PNG or PDF file.";
  }
  if (Object.keys(errors).length || !buf || !type) return Response.json({ errors }, { status: 400 });

  // Duplicate protection, two layers:
  // 1) one active submission per order — a second submission for the same order is a duplicate whatever receipt it carries;
  // 2) the identical receipt file may never be reused — not twice by the same customer, and not across different orders.
  // Either one would otherwise let an admin verify the same payment twice and fire two Purchase events.
  const receiptHash = createHash("sha256").update(buf).digest("hex");
  const cdb = confirmationsDb();
  const forOrder = cdb.prepare(
    "SELECT id FROM payment_confirmations WHERE order_number = ? AND status IN ('awaiting_verification', 'paid') LIMIT 1"
  ).get(orderReference);
  if (forOrder) return Response.json({ error: "Payment details for this order have already been submitted. We are reviewing them — please do not submit again." }, { status: 409 });
  const dup = cdb.prepare("SELECT id FROM payment_confirmations WHERE receipt_hash = ? LIMIT 1").get(receiptHash);
  if (dup) return Response.json({ error: "This receipt has already been submitted. We already have it — please do not submit it again." }, { status: 409 });

  const tracking = JSON.stringify({
    fbp: cookie(req, "_fbp") || undefined, fbc: cookie(req, "_fbc") || undefined, ttp: cookie(req, "_ttp") || undefined,
    ua: (req.headers.get("user-agent") || "").slice(0, 300), ip: ipOf(req),
  });
  const r = cdb.prepare(
    `INSERT INTO payment_confirmations (full_name, phone, amount_paid, address, state, tracking, receipt_hash, order_number) VALUES (?,?,?,?,?,?,?,?)`
  ).run(name, phone, amount, address, state, tracking, receiptHash, orderReference);
  const id = Number(r.lastInsertRowid);
  const file2 = `PC${id}-${randomBytes(6).toString("hex")}.${type}`;
  try {
    await fs.mkdir(RECEIPT_DIR, { recursive: true });
    await fs.writeFile(path.join(RECEIPT_DIR, file2), buf, { mode: 0o600 });
  } catch {
    confirmationsDb().prepare("DELETE FROM payment_confirmations WHERE id = ?").run(id);
    return Response.json({ error: "We could not save your receipt. Try again, or send it on WhatsApp." }, { status: 500 });
  }
  confirmationsDb().prepare("UPDATE payment_confirmations SET receipt_path = ? WHERE id = ?").run(file2, id);
  notifyAdmin(`payconf-${id}`, "payment_confirmation", `Payment details received: ${name}`,
    `${name}, ${phone}, ₦${amount.toLocaleString("en-NG")}, ${state}. Submitted ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Awaiting verification.`,
    "/admin/payment-confirmations");
  return Response.json({ ok: true });
}
