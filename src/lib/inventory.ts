import "server-only";
import { db, tx, type DB } from "@/lib/db";
import { notifyAdmin } from "@/lib/admin-events";

/*
 * Inventory. A variant with stock NULL is "not tracked" (always available). Tracked stock changes only through
 * these helpers, and every change writes a stock_movements row.
 * Orders reserve stock when they are placed (existing behaviour) and release it if cancelled. Releases are
 * calculated from the order's own movements, so a cancellation can never add stock back twice.
 */
export const REASONS: Record<string, string> = {
  opening: "Opening stock", increase: "Stock received", decrease: "Stock removed", correction: "Stock count correction",
  order_reserved: "Reserved by order", order_released: "Released (order cancelled)",
};

export function recordMovement(d: DB, variantId: number, delta: number, reason: string, note: string, actor: string, orderId: number | null = null) {
  const v = d.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId);
  const after = v?.stock == null ? null : Number(v.stock);
  d.prepare("INSERT INTO stock_movements (variant_id, order_id, delta, stock_after, reason, note, actor) VALUES (?,?,?,?,?,?,?)")
    .run(variantId, orderId, delta, after, reason, note.slice(0, 300), actor.slice(0, 120));
  if (after != null && delta < 0) lowStockAlert(d, variantId, after);
}

/** One notification per low-stock episode: the key resets once stock goes back above the threshold. */
function lowStockAlert(d: DB, variantId: number, after: number) {
  const v = d.prepare("SELECT v.label, v.low_stock_threshold t, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?").get(variantId);
  const t = v?.t == null ? 0 : Number(v.t);
  if (!v || (after > t && after > 0)) return;
  const episode = Number(d.prepare("SELECT COALESCE(MAX(id),0) m FROM stock_movements WHERE variant_id = ? AND (stock_after IS NULL OR stock_after > ?)").get(variantId, Math.max(t, 0))?.m || 0);
  const out = after <= 0;
  notifyAdmin(`stock:${variantId}:${out ? "out" : "low"}:${episode}`, "low_stock", out ? "Product out of stock" : "Product stock is low",
    `${String(v.name)} · ${String(v.label)}: ${after} left`, "/admin/inventory?status=" + (out ? "out" : "low"), d);
}

export type AdjustKind = "opening" | "increase" | "decrease" | "correction" | "untrack";
/** Admin stock change. Returns an error message, or null when saved. */
export function adjustStock(variantId: number, kind: AdjustKind, qty: number, note: string, actor: string): string | null {
  if (!Number.isInteger(qty) || qty < 0 || qty > 1_000_000) return "Enter a whole number of units.";
  return tx((d) => {
    const v = d.prepare("SELECT id, stock FROM variants WHERE id = ?").get(variantId);
    if (!v) return "Product option not found.";
    const cur = v.stock == null ? null : Number(v.stock);
    if (kind === "untrack") {
      d.prepare("UPDATE variants SET stock = NULL WHERE id = ?").run(variantId);
      recordMovement(d, variantId, 0, "correction", note || "Stock tracking switched off", actor);
      return null;
    }
    if ((kind === "increase" || kind === "decrease") && cur == null) return "Set opening stock first. This option is not tracked yet.";
    if (kind === "decrease" && qty > (cur as number)) return `Only ${cur} in stock. You cannot remove ${qty}.`;
    if ((kind === "increase" || kind === "decrease") && qty === 0) return "Enter a quantity above zero.";
    const next = kind === "increase" ? (cur as number) + qty : kind === "decrease" ? (cur as number) - qty : qty;
    d.prepare("UPDATE variants SET stock = ? WHERE id = ?").run(next, variantId);
    recordMovement(d, variantId, next - (cur ?? 0), kind, note, actor);
    return null;
  });
}

/** Releases whatever an order still holds. Safe to call more than once. */
export function releaseOrderStock(d: DB, orderId: number, actor: string, note: string) {
  const held = d.prepare("SELECT variant_id, SUM(delta) net FROM stock_movements WHERE order_id = ? GROUP BY variant_id").all(orderId);
  const items = d.prepare("SELECT variant_id, qty FROM order_items WHERE order_id = ?").all(orderId);
  const byVariant = new Map(held.map((h) => [Number(h.variant_id), Number(h.net)]));
  for (const it of items) {
    const vid = Number(it.variant_id);
    // Orders placed before movement tracking have no rows: treat their quantity as still held once.
    if (!byVariant.has(vid)) {
      // Record the implicit reservation once, without touching stock, so later reopen/cancel maths stays exact.
      // Variants without stock tracking have nothing to reserve or release, so no history row is written for them.
      const cur = d.prepare("SELECT stock FROM variants WHERE id = ?").get(vid);
      if (cur?.stock == null) continue;
      d.prepare("INSERT INTO stock_movements (variant_id, order_id, delta, stock_after, reason, note, actor) VALUES (?,?,?,?, 'order_reserved', 'Reserved before stock history began', 'system')")
        .run(vid, orderId, -Number(it.qty), cur?.stock == null ? null : Number(cur.stock));
      byVariant.set(vid, -Number(it.qty));
    }
    const net = byVariant.get(vid) as number;
    if (net >= 0) continue;
    const r = d.prepare("UPDATE variants SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL").run(-net, vid);
    if (Number(r.changes) > 0) recordMovement(d, vid, -net, "order_released", note, actor, orderId);
  }
}

/** Re-reserves stock for an order that is brought back from Cancelled. Fails if stock is no longer there. */
export function reserveOrderStock(d: DB, orderId: number, actor: string, note: string): string | null {
  const items = d.prepare("SELECT variant_id, qty, name FROM order_items WHERE order_id = ?").all(orderId);
  const held = new Map(d.prepare("SELECT variant_id, SUM(delta) net FROM stock_movements WHERE order_id = ? GROUP BY variant_id").all(orderId).map((h) => [Number(h.variant_id), Number(h.net)]));
  for (const it of items) {
    const vid = Number(it.variant_id);
    const need = Number(it.qty) + (held.get(vid) ?? 0);
    if (need <= 0) continue;
    const v = d.prepare("SELECT stock FROM variants WHERE id = ?").get(vid);
    if (v && v.stock != null && Number(v.stock) < need) return `${it.name}: only ${v.stock} in stock.`;
    const r = d.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL").run(need, vid);
    if (Number(r.changes) > 0) recordMovement(d, vid, -need, "order_reserved", note, actor, orderId);
  }
  return null;
}

export type InvRow = { variantId: number; productId: number; product: string; label: string; sku: string; stock: number | null; threshold: number | null; status: "untracked" | "out" | "low" | "ok"; productStatus: string };
export function inventoryRows(f: { q?: string; status?: string } = {}) {
  const rows = db().prepare(`SELECT v.id, v.product_id, v.label, v.sku, v.stock, v.low_stock_threshold, p.name, p.status pstatus
    FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status != 'archived' ORDER BY p.sort, p.id, v.sort, v.id`).all();
  const out: InvRow[] = rows.map((r) => {
    const stock = r.stock == null ? null : Number(r.stock);
    const threshold = r.low_stock_threshold == null ? null : Number(r.low_stock_threshold);
    const status = stock == null ? "untracked" : stock <= 0 ? "out" : threshold != null && stock <= threshold ? "low" : "ok";
    return { variantId: Number(r.id), productId: Number(r.product_id), product: String(r.name), label: String(r.label), sku: String(r.sku), stock, threshold, status, productStatus: String(r.pstatus) };
  });
  const q = (f.q || "").toLowerCase();
  return out.filter((r) => (!q || `${r.product} ${r.label} ${r.sku}`.toLowerCase().includes(q)) && (!f.status || r.status === f.status));
}

export function movements(variantId?: number, limit = 100) {
  const sql = `SELECT m.*, v.label, v.sku, p.name pname, o.number onumber FROM stock_movements m
    LEFT JOIN variants v ON v.id = m.variant_id LEFT JOIN products p ON p.id = v.product_id LEFT JOIN orders o ON o.id = m.order_id
    ${variantId ? "WHERE m.variant_id = ?" : ""} ORDER BY m.id DESC LIMIT ?`;
  return (variantId ? db().prepare(sql).all(variantId, limit) : db().prepare(sql).all(limit)) as Record<string, unknown>[];
}
