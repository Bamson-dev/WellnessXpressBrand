import { db } from "@/lib/db";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";
import { clean } from "@/lib/validate";
import { normalisePhone } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("review:" + ipOf(req), 4, 60_000)) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const slug = clean(body?.product, 100);
  const orderNumber = clean(body?.orderNumber, 40);
  const phone = normalisePhone(clean(body?.phone, 30));
  const rating = Number(body?.rating);
  const review = clean(body?.review, 1200);
  if (!slug || !orderNumber || !phone || !Number.isInteger(rating) || rating < 1 || rating > 5 || review.length < 10)
    return Response.json({ error: "Enter your order number, order phone, a rating, and a review of at least 10 characters." }, { status: 400 });
  const order = db().prepare(`SELECT o.id,o.customer_name FROM orders o WHERE o.number=? AND o.phone=? AND o.payment_status='paid' AND o.fulfilment_status!='cancelled'`).get(orderNumber, phone);
  const product = db().prepare("SELECT id FROM products WHERE slug=? AND status='published'").get(slug);
  if (!order || !product || !db().prepare("SELECT 1 FROM order_items WHERE order_id=? AND product_id=?").get(order.id, product.id))
    return Response.json({ error: "We could not verify a paid order for this product with those details." }, { status: 400 });
  try {
    db().prepare(`INSERT INTO product_reviews (product_id,order_id,customer_name,rating,review_text,status,verified_purchase) VALUES (?,?,?,?,?,'pending',1)`)
      .run(product.id, order.id, clean(order.customer_name, 80) || "Verified customer", rating, review);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "A review has already been submitted for this product and order." }, { status: 409 });
    throw error;
  }
  return Response.json({ ok: true, message: "Thanks. Your verified review is awaiting moderation." });
}
