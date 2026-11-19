import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db, tx } from "@/lib/db";
import { quoteLines } from "@/lib/catalog";
import { deliveryQuote, getBank } from "@/lib/settings";
import { recordMovement, releaseOrderStock } from "@/lib/inventory";
import { NIGERIAN_STATES, normalisePhone } from "@/lib/site";
import { clean, isEmail } from "@/lib/validate";
import { logAdminActivity, notifyAdmin } from "@/lib/admin-events";
import { validateCoupon } from "@/lib/coupons";

export type OrderRow = Record<string, unknown> & {
  id: number; number: string; access_token: string; created_at: string; customer_name: string; phone: string; whatsapp: string;
  email: string; state: string; city: string; address: string; instructions: string; subtotal: number; delivery_fee: number | null;
  total: number | null; payment_status: string; fulfilment_status: string; payment_reference: string; payer_name: string;
  payment_note: string; receipt_path: string; payment_submitted_at: string | null; paid_at: string | null; verified_by: string;
  admin_notes: string; bank_snapshot: string;
};
export type OrderItem = { id: number; product_id: number; variant_id: number; name: string; variant_label: string; sku: string; unit_price: number; qty: number; line_total: number; discount_amount: number };

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function orderNumber() {
  const d = new Date();
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, "");
  const b = randomBytes(5);
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPH[b[i] % ALPH.length];
  return `WX${ymd}-${s}`;
}

export type CheckoutInput = {
  name: unknown; phone: unknown; whatsapp: unknown; email: unknown; state: unknown; city: unknown; address: unknown; instructions: unknown;
  items: unknown;
  clientKey?: unknown;
  couponCode?: unknown;
  tracking?: { fbp?: string; fbc?: string; ua?: string; ip?: string };
};

export function createOrder(input: CheckoutInput) {
  const errors: Record<string, string> = {};
  const name = clean(input.name, 100);
  const phone = normalisePhone(clean(input.phone, 30));
  const waRaw = clean(input.whatsapp, 30);
  const whatsapp = waRaw ? normalisePhone(waRaw) : "";
  const email = clean(input.email, 254).toLowerCase();
  const state = clean(input.state, 40);
  const city = clean(input.city, 80);
  const address = clean(input.address, 300);
  const instructions = clean(input.instructions, 500);
  if (name.length < 2) errors.name = "Enter your full name.";
  if (!phone) errors.phone = "Enter a valid Nigerian phone number, for example 0803 123 4567.";
  if (waRaw && !whatsapp) errors.whatsapp = "Enter a valid WhatsApp number, or leave this empty.";
  if (email && !isEmail(email)) errors.email = "Enter a valid email address, or leave this empty.";
  if (!NIGERIAN_STATES.includes(state)) errors.state = "Choose your state.";
  const delivery = deliveryQuote(state);
  if (NIGERIAN_STATES.includes(state) && !delivery.available) errors.state = delivery.message;
  const clientKey = /^[A-Za-z0-9_-]{16,64}$/.test(String(input.clientKey || "")) ? String(input.clientKey) : "";
  if (clientKey) {
    // Repeated submission of the same checkout (double tap, retry): return the existing order instead of creating another.
    const existing = db().prepare("SELECT number, access_token, total, subtotal, delivery_fee, discount_amount, coupon_code FROM orders WHERE client_key = ?").get(clientKey);
    if (existing) return { ok: true as const, duplicate: true, number: String(existing.number), token: String(existing.access_token), total: Number(existing.total), subtotal: Number(existing.subtotal), itemsSubtotal: Number(existing.subtotal) + Number(existing.discount_amount || 0), discountAmount: Number(existing.discount_amount || 0), couponCode: String(existing.coupon_code || ""), fee: existing.delivery_fee == null ? null : Number(existing.delivery_fee) };
  }
  if (city.length < 2) errors.city = "Enter your city or local government area.";
  if (address.length < 8) errors.address = "Enter your full delivery address.";

  const raw = Array.isArray(input.items) ? (input.items as { variantId: unknown; qty: unknown }[]) : [];
  const merged = new Map<number, number>();
  for (const it of raw.slice(0, 50)) {
    const id = Number(it?.variantId);
    const q = Number(it?.qty);
    if (Number.isInteger(id) && id > 0) merged.set(id, (merged.get(id) || 0) + (Number.isInteger(q) ? q : 0));
  }
  const lines = quoteLines([...merged].map(([variantId, qty]) => ({ variantId, qty })));
  if (!lines.length) errors.items = "Your cart is empty.";
  const bad = lines.find((l) => !l.available);
  if (bad) errors.items = `${bad.name} (${bad.label}): ${bad.reason}. Update your cart and try again.`;
  if (Object.keys(errors).length) return { ok: false as const, errors };

  const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  // Delivery is free across Nigeria. The fee is fixed on the server (never taken from the browser) and stored
  // on the order as a ₦0 snapshot. There is no delivery payment to collect, so its status is "not_required".
  const fee = 0;
  const deliveryStatus = "not_required";
  const bank = getBank();

  const couponCode = String(input.couponCode || "").trim();
  const customerKey = `phone:${createHash("sha256").update(phone).digest("hex")}`;

  return tx((d) => {
    // Coupons are validated again here, inside the transaction, so limits hold under concurrent checkouts.
    const coupon = couponCode ? validateCoupon(couponCode, lines.map((l) => ({ productId: l.productId, variantId: l.variantId, lineTotal: l.lineTotal })), customerKey, d) : null;
    if (coupon && !coupon.ok) throw new Error(`coupon:${coupon.error}`);
    const discountAmount = coupon?.ok ? coupon.discountAmount : 0;
    const subtotal = itemsSubtotal - discountAmount; // product payment due
    const total = subtotal + fee;
    const lineDiscounts = new Map<number, number>();
    if (coupon?.ok) {
      const eligible = lines.filter((l) => coupon.eligibleVariantIds.includes(l.variantId));
      let allocated = 0;
      for (const l of eligible) {
        const share = Math.min(l.lineTotal, Math.floor((discountAmount * l.lineTotal) / coupon.eligibleSubtotal));
        lineDiscounts.set(l.variantId, share);
        allocated += share;
      }
      let remainder = discountAmount - allocated;
      for (const l of eligible) {
        if (!remainder) break;
        const prior = lineDiscounts.get(l.variantId) || 0;
        const extra = Math.min(l.lineTotal - prior, remainder);
        lineDiscounts.set(l.variantId, prior + extra);
        remainder -= extra;
      }
    }
    // Re-check stock inside the transaction, then reserve it.
    for (const l of lines) {
      const v = d.prepare("SELECT stock FROM variants WHERE id = ?").get(l.variantId);
      if (v && v.stock != null && Number(v.stock) < l.qty) throw new Error(`stock:${l.name}`);
    }
    let number = orderNumber();
    while (d.prepare("SELECT 1 FROM orders WHERE number = ?").get(number)) number = orderNumber();
    const token = randomBytes(24).toString("base64url");
    const r = d
      .prepare(
        `INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,delivery_payment_status,
           delivery_eta,delivery_fee_source,client_key,bank_snapshot,tracking,discount_amount,coupon_code)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'free_delivery',?,?,?,?,?)`
      )
      .run(number, token, name, phone, whatsapp, email, state, city, address, instructions, subtotal, fee, total, deliveryStatus,
        delivery.eta, clientKey, JSON.stringify(bank), JSON.stringify(trackingOf(input)), discountAmount, coupon?.ok ? coupon.code : "");
    const oid = Number(r.lastInsertRowid);
    if (coupon?.ok) {
      const couponRow = d.prepare("SELECT id FROM coupons WHERE code = ?").get(coupon.code);
      d.prepare("INSERT INTO coupon_redemptions (coupon_id,order_id,customer_key,discount_amount) VALUES (?,?,?,?)").run(couponRow?.id, oid, customerKey, discountAmount);
    }
    const insI = d.prepare("INSERT INTO order_items (order_id,product_id,variant_id,name,variant_label,sku,unit_price,qty,line_total,discount_amount) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const l of lines) {
      insI.run(oid, l.productId, l.variantId, l.name, l.label, l.sku, l.unitPrice, l.qty, l.lineTotal, lineDiscounts.get(l.variantId) || 0);
      const u = d.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?").run(l.qty, l.variantId, l.qty);
      const tracked = d.prepare("SELECT stock FROM variants WHERE id = ?").get(l.variantId)?.stock != null;
      if (tracked && Number(u.changes) === 0) throw new Error(`stock:${l.name}`);
      if (tracked) recordMovement(d, l.variantId, -l.qty, "order_reserved", `Order ${number}`, "customer", oid);
    }
    d.prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)").run(
      oid, "customer", "order_placed", `${coupon?.ok ? `Coupon ${coupon.code} saved ₦${discountAmount.toLocaleString("en-NG")}. ` : ""}Product payment due: ₦${subtotal.toLocaleString("en-NG")}. Free delivery to ${state}.`
    );
    notifyAdmin(`order:${oid}:created`, "new_order", "New order received", `${number} · ${name} · ${state}`, `/admin/orders/${oid}`);
    return { ok: true as const, duplicate: false, number, token, total, subtotal, itemsSubtotal, discountAmount, couponCode: coupon?.ok ? coupon.code : "", fee };
  });
}

function trackingOf(i: CheckoutInput) {
  if (!process.env.NEXT_PUBLIC_META_PIXEL_ID) return {};
  const t = i.tracking || {};
  const ok = (v: unknown) => typeof v === "string" && /^fb\.\d\.\d+\.[\w-]+$/.test(v) ? v : undefined;
  return { fbp: ok(t.fbp), fbc: ok(t.fbc), ua: clean(t.ua, 400) || undefined, ip: clean(t.ip, 45) || undefined };
}

export function getOrderByNumber(number: string) {
  return (db().prepare("SELECT * FROM orders WHERE number = ?").get(number) as OrderRow | undefined) || null;
}
export function getOrderById(id: number) {
  return (db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined) || null;
}
export function orderItems(id: number) {
  return db().prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(id) as unknown as OrderItem[];
}
export function orderEvents(id: number) {
  return db().prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC").all(id) as { at: string; actor: string; action: string; note: string }[];
}

/** Customer access: the order number alone is not enough; the private token from the confirmation link is required. */
export function getOrderForCustomer(number: string, token: string) {
  const o = getOrderByNumber(clean(number, 40));
  if (!o || !token) return null;
  const a = Buffer.from(String(o.access_token));
  const b = Buffer.from(String(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return o;
}

export function logEvent(orderId: number, actor: string, action: string, note = "") {
  const ev = db().prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)").run(orderId, actor, action, note);
  db().prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId);
  const number = String(db().prepare("SELECT number FROM orders WHERE id = ?").get(orderId)?.number || `Order ${orderId}`);
  if (actor !== "customer" && actor !== "system") logAdminActivity(actor, action, "order", orderId, `${number} ${note}`.trim());
  // One notification per submission (keyed on the event row), so a resubmission after a failed payment is not lost.
  if (action === "payment_confirmation_submitted") notifyAdmin(`order:${orderId}:payment-submitted:${ev.lastInsertRowid}`, "payment_update", "Product payment confirmation submitted", number, `/admin/orders/${orderId}`);
  if (action === "delivery_payment_confirmation_submitted") notifyAdmin(`order:${orderId}:delivery-payment-submitted:${ev.lastInsertRowid}`, "payment_update", "Delivery payment confirmation submitted", number, `/admin/orders/${orderId}`);
}

/** Kept for callers outside a transaction. Uses movement history so stock is never released twice. */
export function restoreStock(orderId: number, actor = "system") {
  tx((d) => releaseOrderStock(d, orderId, actor, "Order cancelled"));
}

export type OrderFilter = { payment?: string; fulfilment?: string; q?: string; limit?: number; offset?: number };
export function listOrders(f: OrderFilter = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.payment === "awaiting_fee") w.push("delivery_payment_status IN ('not_set','pending') AND fulfilment_status != 'cancelled'");
  else if (f.payment) { w.push("payment_status = ?"); p.push(f.payment); }
  if (f.fulfilment) { w.push("fulfilment_status = ?"); p.push(f.fulfilment); }
  if (f.q) {
    const like = "%" + f.q.replace(/[%_]/g, "") + "%";
    w.push("(number LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR email LIKE ? OR payment_reference LIKE ?)");
    p.push(like, like, like, like, like);
  }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const rows = db().prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...p, f.limit || 50, f.offset || 0) as OrderRow[];
  const count = Number(db().prepare(`SELECT COUNT(*) c FROM orders ${where}`).get(...p)?.c || 0);
  return { rows, count };
}

export function dashboardStats() {
  const q = (sql: string) => db().prepare(sql).get() as Record<string, number>;
  return {
    total: q("SELECT COUNT(*) c FROM orders").c,
    pending: q("SELECT COUNT(*) c FROM orders WHERE payment_status='pending_payment' AND fulfilment_status!='cancelled'").c,
    awaitingFee: q("SELECT COUNT(*) c FROM orders WHERE delivery_fee IS NULL AND fulfilment_status!='cancelled'").c,
    awaitingDeliveryPayment: q("SELECT COUNT(*) c FROM orders WHERE delivery_payment_status='pending' AND fulfilment_status!='cancelled'").c,
    awaiting: q("SELECT COUNT(*) c FROM orders WHERE payment_status='awaiting_verification'").c,
    paid: q("SELECT COUNT(*) c FROM orders WHERE payment_status='paid'").c,
    sales: q("SELECT COALESCE(SUM(subtotal),0) s FROM orders WHERE payment_status='paid' AND fulfilment_status!='cancelled'").s,
    customers: q("SELECT COUNT(DISTINCT phone) c FROM orders").c,
  };
}

export function bankOf(o: OrderRow) {
  try { return JSON.parse(o.bank_snapshot) as ReturnType<typeof getBank>; } catch { return getBank(); }
}
