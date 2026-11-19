import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const validDate = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`));
export function analyticsRange(from?: string, to?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const end = validDate(to || "") ? to! : today;
  const startFallback = new Date(Date.parse(`${end}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
  const start = validDate(from || "") ? from! : startFallback;
  const after = new Date(Date.parse(`${end}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  return { from: start <= end ? start : startFallback, to: end, start: `${start <= end ? start : startFallback} 00:00:00`, end: `${after} 00:00:00` };
}

export function salesAnalytics(range: { start: string; end: string }) {
  const d = db();
  const orders = d.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN payment_status='paid' AND fulfilment_status!='cancelled' THEN 1 ELSE 0 END) paid,
    SUM(CASE WHEN payment_status='pending_payment' AND fulfilment_status!='cancelled' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN payment_status='awaiting_verification' AND fulfilment_status!='cancelled' THEN 1 ELSE 0 END) awaiting,
    SUM(CASE WHEN fulfilment_status='cancelled' THEN 1 ELSE 0 END) cancelled,
    SUM(CASE WHEN fulfilment_status='delivered' THEN 1 ELSE 0 END) completed,
    COALESCE(SUM(CASE WHEN payment_status='paid' AND fulfilment_status!='cancelled' THEN subtotal ELSE 0 END),0) revenue,
    COALESCE(SUM(CASE WHEN delivery_payment_status='paid' AND fulfilment_status!='cancelled' THEN delivery_fee ELSE 0 END),0) delivery_collected,
    COALESCE(SUM(CASE WHEN payment_status='paid' AND fulfilment_status!='cancelled' THEN discount_amount ELSE 0 END),0) discounts,
    COALESCE(SUM(CASE WHEN payment_status IN ('pending_payment','awaiting_verification','payment_failed') AND fulfilment_status!='cancelled' THEN subtotal ELSE 0 END),0) pending_amount,
    COALESCE(SUM(CASE WHEN delivery_payment_status='pending' AND fulfilment_status!='cancelled' THEN delivery_fee ELSE 0 END),0) delivery_pending
    FROM orders WHERE created_at>=? AND created_at<?`).get(range.start, range.end);
  const paid = Number(orders?.paid || 0);
  const revenue = Number(orders?.revenue || 0);
  const products = d.prepare(`SELECT oi.name,oi.variant_label,SUM(oi.qty) quantity,SUM(oi.line_total-oi.discount_amount) gross
    FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE o.created_at>=? AND o.created_at<? AND o.payment_status='paid' AND o.fulfilment_status!='cancelled'
    GROUP BY oi.product_id,oi.variant_label,oi.name ORDER BY gross DESC LIMIT 100`).all(range.start, range.end);
  const categories = d.prepare(`SELECT COALESCE(c.name,'Uncategorised') name,COUNT(DISTINCT o.id) orders,
    SUM(oi.line_total-oi.discount_amount) gross FROM order_items oi JOIN orders o ON o.id=oi.order_id
    LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.slug=p.category
    WHERE o.created_at>=? AND o.created_at<? AND o.payment_status='paid' AND o.fulfilment_status!='cancelled'
    GROUP BY c.slug,c.name ORDER BY gross DESC`).all(range.start, range.end);
  const states = d.prepare(`SELECT state,COUNT(*) orders,SUM(subtotal) revenue,
    SUM(CASE WHEN delivery_payment_status='paid' THEN COALESCE(delivery_fee,0) ELSE 0 END) delivery_collected
    FROM orders WHERE created_at>=? AND created_at<? AND payment_status='paid' AND fulfilment_status!='cancelled'
    GROUP BY state ORDER BY revenue DESC`).all(range.start, range.end);
  return { summary: {
    total: Number(orders?.total || 0), paid, pending: Number(orders?.pending || 0), awaiting: Number(orders?.awaiting || 0),
    cancelled: Number(orders?.cancelled || 0), completed: Number(orders?.completed || 0), revenue,
    delivery_collected: Number(orders?.delivery_collected || 0), discounts: Number(orders?.discounts || 0),
    total_collected: revenue + Number(orders?.delivery_collected || 0), pending_amount: Number(orders?.pending_amount || 0),
    delivery_pending: Number(orders?.delivery_pending || 0), avgOrderValue: paid ? Math.round(revenue / paid) : 0,
  }, products, categories, states };
}
