import "server-only";
import { db } from "@/lib/db";

/**
 * Customers are built from orders and identified by phone number (customers do not need accounts).
 * Money figures use verified payments only: product payments the admin confirmed, plus any old separate
 * delivery fees the admin confirmed. Unpaid orders count as outstanding, never as spending.
 */
const STATS = `COUNT(*) orders,
  SUM(CASE WHEN fulfilment_status != 'cancelled' THEN 1 ELSE 0 END) active_orders,
  COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN subtotal ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN delivery_payment_status = 'paid' THEN COALESCE(delivery_fee, 0) ELSE 0 END), 0) confirmed,
  COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) paid_orders,
  COALESCE(SUM(CASE WHEN payment_status != 'paid' AND fulfilment_status != 'cancelled' THEN subtotal ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN delivery_payment_status = 'pending' AND fulfilment_status != 'cancelled' THEN COALESCE(delivery_fee, 0) ELSE 0 END), 0) outstanding,
  MAX(created_at) last_order, MIN(created_at) first_order`;

export function listCustomers(f: { q?: string; sort?: string; page?: number }) {
  const where: string[] = []; const p: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const digits = f.q.replace(/\D/g, "").replace(/^0/, "");
    where.push("(customer_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'" + (digits.length >= 4 ? " OR phone LIKE ?" : "") + ")");
    p.push(like, like); if (digits.length >= 4) p.push(`%${digits}%`);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const order = f.sort === "spend" ? "confirmed DESC" : f.sort === "orders" ? "orders DESC" : f.sort === "outstanding" ? "outstanding DESC" : "last_order DESC";
  const page = Math.max(1, f.page || 1);
  const total = Number(db().prepare(`SELECT COUNT(DISTINCT phone) n FROM orders ${w}`).get(...p)?.n || 0);
  const rows = db().prepare(`SELECT phone, (SELECT customer_name FROM orders o2 WHERE o2.phone = orders.phone ORDER BY id DESC LIMIT 1) name,
    (SELECT email FROM orders o2 WHERE o2.phone = orders.phone AND email != '' ORDER BY id DESC LIMIT 1) email,
    (SELECT state FROM orders o2 WHERE o2.phone = orders.phone ORDER BY id DESC LIMIT 1) state, ${STATS}
    FROM orders ${w} GROUP BY phone ORDER BY ${order} LIMIT 50 OFFSET ?`).all(...p, (page - 1) * 50);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 50)) };
}

export function getCustomer(phone: string) {
  if (!/^\d{8,15}$/.test(phone)) return null;
  const stats = db().prepare(`SELECT ${STATS} FROM orders WHERE phone = ?`).get(phone);
  if (!stats || !Number(stats.orders)) return null;
  const latest = db().prepare("SELECT customer_name, email, whatsapp, state, city, address FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 1").get(phone)!;
  const orders = db().prepare("SELECT id, number, created_at, subtotal, delivery_fee, delivery_payment_status, payment_status, fulfilment_status, state, coupon_code, discount_amount FROM orders WHERE phone = ? ORDER BY id DESC").all(phone);
  const addresses = db().prepare("SELECT DISTINCT address, city, state FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 10").all(phone);
  const activity = db().prepare(`SELECT e.at, e.actor, e.action, e.note, o.number FROM order_events e JOIN orders o ON o.id = e.order_id WHERE o.phone = ? ORDER BY e.id DESC LIMIT 100`).all(phone);
  const reviews = db().prepare(`SELECT r.created_at, r.rating, r.status, p.name FROM product_reviews r JOIN orders o ON o.id = r.order_id JOIN products p ON p.id = r.product_id WHERE o.phone = ? ORDER BY r.id DESC`).all(phone);
  const note = db().prepare("SELECT note, updated_by, updated_at FROM customer_notes WHERE customer_key = ?").get(`phone:${phone}`);
  return { phone, stats, latest, orders, addresses, activity, reviews, note };
}

export function allCustomersForExport() {
  return db().prepare(`SELECT phone, (SELECT customer_name FROM orders o2 WHERE o2.phone = orders.phone ORDER BY id DESC LIMIT 1) name,
    (SELECT email FROM orders o2 WHERE o2.phone = orders.phone AND email != '' ORDER BY id DESC LIMIT 1) email,
    (SELECT state FROM orders o2 WHERE o2.phone = orders.phone ORDER BY id DESC LIMIT 1) state, ${STATS}
    FROM orders GROUP BY phone ORDER BY last_order DESC`).all();
}
