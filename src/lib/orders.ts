import "server-only";
import { randomBytes, timingSafeEqual } from "crypto";
import { db, tx } from "@/lib/db";
import { quoteLines } from "@/lib/catalog";
import { deliveryFeeFor, getBank } from "@/lib/settings";
import { NIGERIAN_STATES, normalisePhone } from "@/lib/site";
import { clean, isEmail } from "@/lib/validate";

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

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const fee = deliveryFeeFor(state);
  const total = fee == null ? null : subtotal + fee;
  const bank = getBank();

  return tx((d) => {
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
        `INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,bank_snapshot,tracking)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(number, token, name, phone, whatsapp, email, state, city, address, instructions, subtotal, fee, total, JSON.stringify(bank), JSON.stringify(trackingOf(input)));
    const oid = Number(r.lastInsertRowid);
    const insI = d.prepare("INSERT INTO order_items (order_id,product_id,variant_id,name,variant_label,sku,unit_price,qty,line_total) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const l of lines) {
      insI.run(oid, l.productId, l.variantId, l.name, l.label, l.sku, l.unitPrice, l.qty, l.lineTotal);
      d.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL").run(l.qty, l.variantId);
    }
    d.prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)").run(
      oid, "customer", "order_placed", fee == null ? "Delivery fee not set for " + state + ". Awaiting fee confirmation." : ""
    );
    return { ok: true as const, number, token, total, subtotal, fee };
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
}

export function restoreStock(orderId: number) {
  for (const it of orderItems(orderId)) db().prepare("UPDATE variants SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL").run(it.qty, it.variant_id);
}

export type OrderFilter = { payment?: string; fulfilment?: string; q?: string; limit?: number; offset?: number };
export function listOrders(f: OrderFilter = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.payment === "awaiting_fee") w.push("total IS NULL AND payment_status = 'pending_payment' AND fulfilment_status != 'cancelled'");
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
    awaitingFee: q("SELECT COUNT(*) c FROM orders WHERE total IS NULL AND payment_status='pending_payment' AND fulfilment_status!='cancelled'").c,
    awaiting: q("SELECT COUNT(*) c FROM orders WHERE payment_status='awaiting_verification'").c,
    paid: q("SELECT COUNT(*) c FROM orders WHERE payment_status='paid'").c,
    sales: q("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_status='paid' AND fulfilment_status!='cancelled'").s,
    customers: q("SELECT COUNT(DISTINCT phone) c FROM orders").c,
  };
}

export function bankOf(o: OrderRow) {
  try { return JSON.parse(o.bank_snapshot) as ReturnType<typeof getBank>; } catch { return getBank(); }
}
