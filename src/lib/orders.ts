import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db, tx } from "@/lib/db";
import { quoteLines } from "@/lib/catalog";
import { getBank } from "@/lib/settings";
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
export type OrderItem = { id: number; product_id: number; variant_id: number; name: string; variant_label: string; sku: string; unit_price: number; qty: number; line_total: number };

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
  // Product payment is collected first. A configured state fee is quoted and remains payable separately.
  const bank = getBank();

  return tx((d) => {
    const zone = d.prepare("SELECT fee,active,estimated_delivery FROM delivery_zones WHERE state=?").get(state);
    if (zone && Number(zone.active) !== 1) throw new Error("delivery:disabled");
    if (!zone || zone.fee == null) throw new Error("delivery:unconfigured");
    const fee = Number(zone.fee);
    const couponCode = String(input.couponCode || "").trim();
    const customerKey = `phone:${createHash("sha256").update(phone).digest("hex")}`;
    const coupon = couponCode ? validateCoupon(couponCode, lines.map((line) => ({ productId: line.productId, variantId: line.variantId, lineTotal: line.lineTotal })), customerKey, d) : null;
    if (coupon && !coupon.ok) throw new Error(`coupon:${coupon.error}`);
    const discountAmount = coupon?.ok ? coupon.discountAmount : 0;
    const subtotal = itemsSubtotal - discountAmount;
    const total = subtotal + fee;
    const lineDiscounts = new Map<number, number>();
    if (coupon?.ok) {
      const eligible = lines.filter((line) => coupon.eligibleVariantIds.includes(line.variantId));
      let allocated = 0;
      for (const line of eligible) {
        const share = Math.min(line.lineTotal, Math.floor(discountAmount * line.lineTotal / coupon.eligibleSubtotal));
        lineDiscounts.set(line.variantId, share);
        allocated += share;
      }
      let remainder = discountAmount - allocated;
      for (const line of eligible) {
        if (!remainder) break;
        const prior = lineDiscounts.get(line.variantId) || 0;
        const extra = Math.min(line.lineTotal - prior, remainder);
        lineDiscounts.set(line.variantId, prior + extra);
        remainder -= extra;
      }
    }
    const deliveryEstimate = String(zone?.estimated_delivery || "");
    // Validate stock at checkout. Tracked stock is deducted only after an admin verifies payment.
    for (const l of lines) {
      const v = d.prepare("SELECT stock FROM variants WHERE id = ?").get(l.variantId);
      if (v && v.stock != null && Number(v.stock) < l.qty) throw new Error(`stock:${l.name}`);
    }
    let number = orderNumber();
    while (d.prepare("SELECT 1 FROM orders WHERE number = ?").get(number)) number = orderNumber();
    const token = randomBytes(24).toString("base64url");
    const r = d
      .prepare(
        `INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,delivery_payment_status,delivery_estimate,bank_snapshot,tracking,discount_amount,coupon_code)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?)`
      )
         .run(number, token, name, phone, whatsapp, email, state, city, address, instructions, subtotal, fee, total, "pending", deliveryEstimate, JSON.stringify(bank), JSON.stringify(trackingOf(input)), discountAmount, coupon?.ok ? coupon.code : "");
    const oid = Number(r.lastInsertRowid);
    if (coupon?.ok) {
      const couponRow = d.prepare("SELECT id FROM coupons WHERE code=?").get(coupon.code);
      d.prepare("INSERT INTO coupon_redemptions(coupon_id,order_id,customer_key,discount_amount) VALUES (?,?,?,?)").run(couponRow?.id, oid, customerKey, discountAmount);
    }
    const insI = d.prepare("INSERT INTO order_items (order_id,product_id,variant_id,name,variant_label,sku,unit_price,qty,line_total,discount_amount) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const l of lines) {
      insI.run(oid, l.productId, l.variantId, l.name, l.label, l.sku, l.unitPrice, l.qty, l.lineTotal, lineDiscounts.get(l.variantId) || 0);
    }
    d.prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)").run(
      oid, "customer", "order_placed", `${coupon?.ok ? `Coupon ${coupon.code} saved ₦${discountAmount.toLocaleString("en-NG")}. ` : ""}Product payment due: ₦${subtotal.toLocaleString("en-NG")}. Delivery fee of ₦${fee.toLocaleString("en-NG")} is payable separately.`
    );
    notifyAdmin(`order:${oid}:created`, "new_order", "New order received", `${number} · ${name} · ${state}`, `/admin/orders/${oid}`);
    return { ok: true as const, number, token, total, subtotal, itemsSubtotal, discountAmount, couponCode: coupon?.ok ? coupon.code : "", fee };
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
  db().prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)").run(orderId, actor, action, note);
  db().prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId);
  const order = db().prepare("SELECT number FROM orders WHERE id=?").get(orderId);
  if (actor !== "customer" && actor !== "system") logAdminActivity(actor, action, "order", orderId, `${String(order?.number || "")} ${note}`.trim());
  if (action === "payment_confirmation_submitted") notifyAdmin(`order:${orderId}:payment-submitted`, "payment_update", "Product payment confirmation submitted", String(order?.number || `Order ${orderId}`), `/admin/orders/${orderId}`);
  if (action === "delivery_payment_confirmation_submitted") notifyAdmin(`order:${orderId}:delivery-payment-submitted`, "payment_update", "Delivery payment confirmation submitted", String(order?.number || `Order ${orderId}`), `/admin/orders/${orderId}`);
}

export function restoreStock(orderId: number, actor = "system") {
  const order = db().prepare("SELECT number FROM orders WHERE id=?").get(orderId);
  if (!order) return;
  const number = String(order.number || orderId);
  const items = db().prepare("SELECT * FROM order_items WHERE order_id=? AND stock_deducted=1").all(orderId) as (OrderItem & { stock_deducted: number })[];
  for (const it of items) {
    const current = db().prepare("SELECT stock FROM variants WHERE id = ?").get(it.variant_id);
    if (!current || current.stock == null) {
      db().prepare("UPDATE order_items SET stock_deducted=0 WHERE id=?").run(it.id);
      continue;
    }
    const previous = Number(current.stock);
    const next = previous + it.qty;
    db().prepare("UPDATE variants SET stock = ? WHERE id = ?").run(next, it.variant_id);
    db().prepare(`INSERT INTO inventory_movements
      (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(it.product_id,it.variant_id,it.name,it.variant_label,it.sku,previous,next,it.qty,
        `Order ${number} cancelled; stock restored`,actor);
    db().prepare("UPDATE order_items SET stock_deducted=0 WHERE id=?").run(it.id);
  }
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
