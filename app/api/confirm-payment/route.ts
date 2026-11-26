import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { RECEIPT_DIR } from "@/lib/db";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { clean, sniffType } from "@/lib/validate";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";
import { NIGERIAN_STATES } from "@/lib/site";
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
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.fullName = "Enter your full name.";
  if (!/^\+?[0-9\s-]{10,16}$/.test(phone) || phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid WhatsApp number.";
  if (!Number.isInteger(amount) || amount < 1000 || amount > 10_000_000) errors.amount = "Enter the amount you paid in naira.";
  if (address.length < 8) errors.address = "Enter your full delivery address.";
  if (!(NIGERIAN_STATES as readonly string[]).includes(state)) errors.state = "Select your state.";

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

  const tracking = JSON.stringify({
    fbp: cookie(req, "_fbp") || undefined, fbc: cookie(req, "_fbc") || undefined,
    ua: (req.headers.get("user-agent") || "").slice(0, 300), ip: ipOf(req),
  });
  const r = confirmationsDb().prepare(
    `INSERT INTO payment_confirmations (full_name, phone, amount_paid, address, state, tracking) VALUES (?,?,?,?,?,?)`
  ).run(name, phone, amount, address, state, tracking);
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
