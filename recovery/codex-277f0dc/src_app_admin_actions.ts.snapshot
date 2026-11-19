"use server";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tx, MEDIA_DIR } from "@/lib/db";
import { hashPassword, login, logout, requireAdmin } from "@/lib/auth";
import { getOrderById, logEvent, orderItems, restoreStock } from "@/lib/orders";
import { setSetting } from "@/lib/settings";
import { sendStorePurchase } from "@/lib/meta";
import { clean, isEmail, sniffType } from "@/lib/validate";
import { limited } from "@/lib/ratelimit";
import { NIGERIAN_STATES, normalisePhone, site } from "@/lib/site";
import { parseDeliveryCsv } from "@/lib/delivery-csv";
import { logAdminActivity, notifyAdmin } from "@/lib/admin-events";

const s = (f: FormData, k: string, max = 500) => clean(f.get(k), max);
const text = (f: FormData, k: string, max = 8000) => {
  const v = f.get(k);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
};
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n) : null;
};
const back = (url: string, msg?: string) => redirect(msg ? `${url}${url.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}` : url);

/* ---------- auth ---------- */
export async function loginAction(_: unknown, f: FormData) {
  const ip = (headers().get("cf-connecting-ip") || headers().get("x-forwarded-for") || "x").split(",")[0];
  if (limited("login:" + ip, 6, 10 * 60_000)) return { error: "Too many attempts. Wait 10 minutes and try again." };
  const ok = await login(s(f, "email", 254), String(f.get("password") || "").slice(0, 200));
  if (!ok) return { error: "Email or password is not correct." };
  redirect("/admin");
}
export async function logoutAction() {
  logout();
  redirect("/admin/login");
}

export async function markNotificationReadAction(f: FormData) {
  await requireAdmin();
  const id = Number(f.get("id"));
  if (f.get("all") === "yes") db().prepare("UPDATE admin_notifications SET read_at=COALESCE(read_at,datetime('now'))").run();
  else if (Number.isSafeInteger(id) && id > 0) db().prepare("UPDATE admin_notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE id=?").run(id);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  back("/admin/notifications", "Notification status updated.");
}

export async function moderateReviewAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const status = String(f.get("status") || "");
  if (!Number.isSafeInteger(id) || id < 1 || !["approved", "rejected"].includes(status)) return back("/admin/reviews", "Choose a valid review action.");
  const review = db().prepare("SELECT r.product_id,p.slug FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE r.id=?").get(id);
  if (!review) return back("/admin/reviews", "Review not found.");
  db().prepare("UPDATE product_reviews SET status=?,updated_at=datetime('now') WHERE id=?").run(status,id);
  logAdminActivity(a.email, status === "approved" ? "review_approved" : "review_rejected", "review", id);
  revalidatePath(`/product/${String(review.slug)}`);
  back("/admin/reviews", `Review ${status}.`);
}

export async function saveTestimonialAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id")) || 0;
  const name = s(f, "customerName", 80);
  const quote = text(f, "quote", 1000);
  if (name.length < 2 || quote.length < 10) return back("/admin/reviews", "Enter the customer's name and their actual statement (at least 10 characters).");
  const approved = f.get("approved") === "on" ? 1 : 0;
  if (id) db().prepare("UPDATE testimonials SET customer_name=?,quote=?,approved=?,updated_at=datetime('now') WHERE id=?").run(name,quote,approved,id);
  else db().prepare("INSERT INTO testimonials (customer_name,quote,approved) VALUES (?,?,?)").run(name,quote,approved);
  logAdminActivity(a.email, id ? "testimonial_updated" : "testimonial_added", "testimonial", id || "new");
  revalidatePath("/");
  back("/admin/reviews", "Testimonial saved.");
}

export async function toggleTestimonialAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return back("/admin/reviews", "Choose a valid testimonial.");
  const r = db().prepare("UPDATE testimonials SET approved=1-approved,updated_at=datetime('now') WHERE id=?").run(id);
  if (!r.changes) return back("/admin/reviews", "Testimonial not found.");
  logAdminActivity(a.email, "testimonial_visibility_toggled", "testimonial", id);
  revalidatePath("/");
  back("/admin/reviews", "Testimonial visibility updated.");
}

export async function saveCouponAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id")) || 0;
  const code = s(f, "code", 40).toUpperCase().replace(/\s+/g, "");
  const type = f.get("discountType") === "percent" ? "percent" : "fixed";
  const value = Number(f.get("discountValue"));
  const minRaw = String(f.get("minimumOrder") ?? "0").trim();
  const minimum = money(minRaw);
  const usageRaw = String(f.get("usageLimit") ?? "").trim();
  const usage = usageRaw ? Number(usageRaw) : null;
  const customerLimit = Number(f.get("customerLimit") || 1);
  const startsAt = s(f, "startsAt", 10);
  const expiresAt = s(f, "expiresAt", 10);
  const dateOk = (x: string) => !x || /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x;
  const productIds = [...new Set(s(f, "productIds", 500).split(",").map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0))];
  const categorySlugs = [...new Set(s(f, "categorySlugs", 500).split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9-]{1,70}$/.test(x)))];
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return back("/admin/promotions", "Coupon code must be 3–40 letters, numbers, hyphens or underscores.");
  if (!Number.isSafeInteger(value) || value < 1 || type === "percent" && value > 100) return back("/admin/promotions", type === "percent" ? "Enter a percentage from 1 to 100." : "Enter a fixed discount of at least ₦1.");
  if (minimum == null || !/^\d+$/.test(minRaw) || usage != null && (!Number.isSafeInteger(usage) || usage < 1) || !Number.isSafeInteger(customerLimit) || customerLimit < 1 || customerLimit > 1000)
    return back("/admin/promotions", "Check the minimum order, usage limit, and per-customer limit.");
  if (!dateOk(startsAt) || !dateOk(expiresAt) || startsAt && expiresAt && startsAt > expiresAt) return back("/admin/promotions", "Enter valid dates and make sure expiry is after the start date.");
  if (productIds.length && db().prepare(`SELECT COUNT(*) n FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`).get(...productIds)?.n !== productIds.length)
    return back("/admin/promotions", "One or more restricted products could not be found.");
  if (categorySlugs.length && db().prepare(`SELECT COUNT(*) n FROM categories WHERE slug IN (${categorySlugs.map(() => "?").join(",")})`).get(...categorySlugs)?.n !== categorySlugs.length)
    return back("/admin/promotions", "One or more restricted categories could not be found.");
  const fields = [code,type,value,startsAt,expiresAt,usage,customerLimit,minimum,JSON.stringify(productIds),JSON.stringify(categorySlugs),f.get("active") === "on" ? 1 : 0];
  try {
    if (id) db().prepare(`UPDATE coupons SET code=?,discount_type=?,discount_value=?,starts_at=?,expires_at=?,usage_limit=?,customer_limit=?,minimum_order=?,product_ids=?,category_slugs=?,active=?,updated_at=datetime('now') WHERE id=?`).run(...fields,id);
    else db().prepare(`INSERT INTO coupons (code,discount_type,discount_value,starts_at,expires_at,usage_limit,customer_limit,minimum_order,product_ids,category_slugs,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...fields);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return back("/admin/promotions", "That coupon code is already in use.");
    throw error;
  }
  logAdminActivity(a.email, id ? "coupon_updated" : "coupon_created", "coupon", id || code, `${code} · ${type} ${value}`);
  revalidatePath("/checkout");
  back("/admin/promotions", "Coupon saved.");
}

export async function deleteCouponAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return back("/admin/promotions", "Choose a valid coupon.");
  const coupon = db().prepare("SELECT code FROM coupons WHERE id=?").get(id);
  if (!coupon) return back("/admin/promotions", "Coupon not found.");
  const uses = Number(db().prepare("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=?").get(id)?.n || 0);
  if (uses) db().prepare("UPDATE coupons SET active=0,updated_at=datetime('now') WHERE id=?").run(id);
  else db().prepare("DELETE FROM coupons WHERE id=?").run(id);
  logAdminActivity(a.email, uses ? "coupon_deactivated_preserving_history" : "coupon_deleted", "coupon", id, `${String(coupon.code)} · ${uses} redemptions`);
  back("/admin/promotions", uses ? "Coupon deactivated. Its redemption history was kept." : "Coupon deleted.");
}

/* ---------- orders ---------- */
export async function setDeliveryFeeAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const fee = money(f.get("fee"));
  const o = getOrderById(id);
  if (!o || fee == null) return back(`/admin/orders/${id}`, "Enter a valid delivery fee.");
  if (o.delivery_payment_status === "paid") return back(`/admin/orders/${id}`, "Delivery payment is already confirmed.");
  db().prepare("UPDATE orders SET delivery_fee = ?, total = subtotal + ?, delivery_payment_status = 'pending', updated_at = datetime('now') WHERE id = ?").run(fee, fee, id);
  logEvent(id, a.email, "delivery_fee_set", `₦${fee.toLocaleString()}`);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, "Delivery fee saved. The customer's order page now shows the final amount.");
}

export async function verifyPaymentAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o) return back("/admin/orders");
  if (f.get("confirm") !== "yes") return back(`/admin/orders/${id}`, "Tick the box to confirm you have seen the money in the bank account.");
  const result = tx((d) => {
    const currentOrder = d.prepare("SELECT payment_status,fulfilment_status FROM orders WHERE id=?").get(id);
    if (!currentOrder) return { ok: false as const, reason: "missing" };
    if (currentOrder.payment_status === "paid") return { ok: false as const, reason: "paid" };
    if (currentOrder.fulfilment_status === "cancelled") return { ok: false as const, reason: "cancelled" };
    const items = orderItems(id);
    for (const item of items) {
      const itemState = d.prepare("SELECT stock_deducted FROM order_items WHERE id=?").get(item.id);
      if (Number(itemState?.stock_deducted) === 1) continue;
      const variant = d.prepare("SELECT stock FROM variants WHERE id=?").get(item.variant_id);
      if (variant && variant.stock != null && Number(variant.stock) < item.qty)
        return { ok: false as const, reason: `stock:${item.name}` };
    }
    for (const item of items) {
      const itemState = d.prepare("SELECT stock_deducted FROM order_items WHERE id=?").get(item.id);
      if (Number(itemState?.stock_deducted) === 1) continue;
      const variant = d.prepare("SELECT stock FROM variants WHERE id=?").get(item.variant_id);
      if (variant && variant.stock != null) {
        const previous = Number(variant.stock);
        const next = previous - item.qty;
        d.prepare("UPDATE variants SET stock=? WHERE id=?").run(next,item.variant_id);
        d.prepare(`INSERT INTO inventory_movements
          (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(item.product_id,item.variant_id,item.name,item.variant_label,item.sku,previous,next,-item.qty,
            `Order ${o.number} payment verified`,a.email);
        d.prepare("UPDATE order_items SET stock_tracked_at_payment=1,stock_deducted=1 WHERE id=?").run(item.id);
      } else {
        d.prepare("UPDATE order_items SET stock_tracked_at_payment=0,stock_deducted=0 WHERE id=?").run(item.id);
      }
    }
    d.prepare("UPDATE orders SET payment_status='paid',paid_at=datetime('now'),verified_by=?,updated_at=datetime('now') WHERE id=?")
      .run(a.email,id);
    return { ok: true as const };
  });
  if (!result.ok) {
    if (result.reason === "stock:" || result.reason?.startsWith("stock:")) return back(`/admin/orders/${id}`, `${result.reason.slice(6)} no longer has enough tracked stock to confirm this payment. Contact the customer to resolve the order.`);
    if (result.reason === "cancelled") return back(`/admin/orders/${id}`, "This order is cancelled. Reopen it before confirming the payment.");
    return back(`/admin/orders/${id}`, result.reason === "paid" ? "Payment is already confirmed." : "Order not found.");
  }
  logEvent(id, a.email, "payment_verified", s(f, "note", 300));
  const skus = orderItems(id).map((i) => i.sku);
  const ev = await sendStorePurchase({ number: o.number, total: o.subtotal, skus, url: `${site.url}/order/${o.number}`, tracking: String(o.tracking || "{}") });
  db().prepare("UPDATE orders SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(ev.eventId, ev.status, id);
  revalidatePath("/admin");
  back(`/admin/orders/${id}`, "Payment confirmed. The order is now Paid.");
}

export async function markDeliveryPaidAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o || o.delivery_fee == null) return back(`/admin/orders/${id}`, "Set the delivery fee before recording payment.");
  if (f.get("confirm") !== "yes") return back(`/admin/orders/${id}`, "Confirm you have seen the delivery payment in the account.");
  if (o.delivery_payment_status === "paid") return back(`/admin/orders/${id}`, "Delivery payment is already confirmed.");
  const reference = s(f, "reference", 120);
  db().prepare("UPDATE orders SET delivery_payment_status = 'paid', delivery_paid_at = datetime('now'), delivery_payment_reference = ?, updated_at = datetime('now') WHERE id = ?").run(reference, id);
  logEvent(id, a.email, "delivery_payment_verified", reference || `₦${Number(o.delivery_fee).toLocaleString("en-NG")}`);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, "Delivery payment recorded.");
}

export async function markPaymentFailedAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o || o.payment_status === "paid") return back(`/admin/orders/${id}`, "Paid orders cannot be marked as failed.");
  const changed = tx((d) => {
    const current = d.prepare("SELECT payment_status FROM orders WHERE id=?").get(id);
    if (!current || current.payment_status === "paid") return false;
    restoreStock(id, a.email);
    d.prepare("UPDATE orders SET payment_status = 'payment_failed', updated_at = datetime('now') WHERE id = ?").run(id);
    return true;
  });
  if (!changed) return back(`/admin/orders/${id}`, "Paid orders cannot be marked as failed.");
  logEvent(id, a.email, "payment_failed", s(f, "note", 300));
  back(`/admin/orders/${id}`, "Marked as Payment Failed. The customer can send a new confirmation.");
}

export async function unverifyPaymentAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  db().prepare("UPDATE orders SET payment_status = 'awaiting_verification', paid_at = NULL, updated_at = datetime('now') WHERE id = ? AND payment_status = 'paid'").run(id);
  logEvent(id, a.email, "payment_unverified", s(f, "note", 300));
  back(`/admin/orders/${id}`, "Payment set back to Awaiting Verification.");
}

export async function setFulfilmentAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const st = s(f, "status", 20);
  const o = getOrderById(id);
  if (!o || !["unfulfilled", "processing", "shipped", "delivered", "cancelled"].includes(st)) return back(`/admin/orders/${id}`);
  if (["processing", "shipped", "delivered"].includes(st) && o.payment_status !== "paid") return back(`/admin/orders/${id}`, "Confirm the product payment before you process or ship this order.");
  if (["processing", "shipped", "delivered"].includes(st) && o.delivery_payment_status !== "paid") return back(`/admin/orders/${id}`, "Confirm the delivery payment before you process or ship this order.");
  if (st === o.fulfilment_status) return back(`/admin/orders/${id}`);
  const result = tx((d) => {
    const currentOrder = d.prepare("SELECT fulfilment_status,payment_status FROM orders WHERE id=?").get(id);
    if (!currentOrder || currentOrder.fulfilment_status === st) return { changed: false, stockAvailable: true };
    const previousStatus = String(currentOrder.fulfilment_status);
    const paymentPaid = currentOrder.payment_status === "paid";
    if (previousStatus === "cancelled" && st !== "cancelled" && paymentPaid) {
      for (const it of orderItems(id)) {
        const tracked = d.prepare("SELECT stock_tracked_at_payment FROM order_items WHERE id=?").get(it.id);
        if (Number(tracked?.stock_tracked_at_payment) !== 1) continue;
        const current = d.prepare("SELECT stock FROM variants WHERE id = ?").get(it.variant_id);
        if (current && current.stock != null && Number(current.stock) < it.qty) return { changed: false, stockAvailable: false };
      }
    }
    d.prepare("UPDATE orders SET fulfilment_status = ?, updated_at = datetime('now') WHERE id = ?").run(st, id);
    if (st === "cancelled" && previousStatus !== "cancelled") restoreStock(id, a.email);
    if (previousStatus === "cancelled" && st !== "cancelled" && paymentPaid) {
      for (const it of orderItems(id)) {
        const tracked = d.prepare("SELECT stock_tracked_at_payment FROM order_items WHERE id=?").get(it.id);
        if (Number(tracked?.stock_tracked_at_payment) !== 1) continue;
        const current = d.prepare("SELECT stock FROM variants WHERE id = ?").get(it.variant_id);
        if (!current || current.stock == null) {
          d.prepare("UPDATE order_items SET stock_deducted=0 WHERE id=?").run(it.id);
          continue;
        }
        const previous = Number(current.stock);
        const next = previous - it.qty;
        d.prepare("UPDATE variants SET stock = ? WHERE id = ?").run(next, it.variant_id);
        d.prepare(`INSERT INTO inventory_movements
          (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(it.product_id,it.variant_id,it.name,it.variant_label,it.sku,previous,next,-it.qty,
            `Order ${o.number} re-opened`,a.email);
        d.prepare("UPDATE order_items SET stock_deducted=1 WHERE id=?").run(it.id);
      }
    }
    return { changed: true, stockAvailable: true };
  });
  if (!result.stockAvailable) return back(`/admin/orders/${id}`, "This order cannot be reopened because one or more items no longer have enough stock.");
  if (!result.changed) return back(`/admin/orders/${id}`);
  logEvent(id, a.email, "fulfilment_" + st, s(f, "note", 300));
  back(`/admin/orders/${id}`, "Order status updated.");
}

export async function saveNotesAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  db().prepare("UPDATE orders SET admin_notes = ?, updated_at = datetime('now') WHERE id = ?").run(text(f, "notes", 4000), id);
  logEvent(id, a.email, "notes_updated");
  back(`/admin/orders/${id}`, "Notes saved.");
}

/* ---------- products ---------- */
const STATUSES = ["published", "draft", "pending_confirmation", "archived"];

export async function createProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const name = s(f, "name", 120);
  const type = f.get("type") === "combo" ? "combo" : "single";
  if (name.length < 2) return back("/admin/products", "Enter a product name.");
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product";
  while (db().prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) slug += "-2";
  const r = db().prepare("INSERT INTO products (slug,name,type,category,status,sort) VALUES (?,?,?,?, 'draft', 999)").run(slug, name, type, type === "combo" ? "combos" : "individual");
  logAdminActivity(a.email, "product_created", "product", Number(r.lastInsertRowid), `${name} (${type})`);
  redirect(`/admin/products/${r.lastInsertRowid}?msg=${encodeURIComponent("Product created as a draft. Add a price option and a photo, then publish it.")}`);
}

/** Clone catalog configuration only. Orders, customers, and sales history are never copied. */
export async function duplicateProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const source = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!source) return back("/admin/products", "Product not found.");
  const slugBase = `${String(source.slug).slice(0, 68)}-copy`;
  let slug = slugBase;
  let suffix = 2;
  while (db().prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) slug = `${slugBase}-${suffix++}`;
  let newId = 0;
  tx((d) => {
    const result = d.prepare(`INSERT INTO products
      (slug,name,type,category,short_description,description,information,ingredients,directions,faqs,images,related,status,featured,sort,review_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft',0,?,?)`).run(
      slug, `${String(source.name)} (Copy)`, source.type, source.category, source.short_description, source.description,
      source.information, source.ingredients, source.directions, source.faqs, source.images, "[]", Number(source.sort) + 1,
      "Draft duplicate. Review its details, image rights, pricing, and stock before publishing."
    );
    newId = Number(result.lastInsertRowid);
    const variants = d.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY sort,id").all(id);
    for (const v of variants) {
      const originalSku = String(v.sku).slice(0, 30);
      let sku = `${originalSku}-COPY-${newId}`;
      let n = 2;
      while (d.prepare("SELECT 1 FROM variants WHERE sku = ?").get(sku)) sku = `${originalSku}-COPY-${newId}-${n++}`;
      d.prepare(`INSERT INTO variants
        (product_id,label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,price_source,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(newId, v.label, v.size, v.duration, sku, v.price, v.sale_price, null,
        v.status, v.needs_confirmation, `Copied from product ${id}; verify before publishing.`, v.sort);
    }
    if (String(source.type) === "combo") {
      const items = d.prepare("SELECT * FROM combo_items WHERE combo_id = ? ORDER BY sort,id").all(id);
      for (const item of items) d.prepare(`INSERT INTO combo_items (combo_id,item_product_id,item_name,size_note,quantity_note,sort)
        VALUES (?,?,?,?,?,?)`).run(newId, item.item_product_id, item.item_name, item.size_note, item.quantity_note, item.sort);
    }
  });
  logAdminActivity(a.email, "product_duplicated", "product", newId, `Copied product ${id} as draft`);
  redirect(`/admin/products/${newId}?msg=${encodeURIComponent("Draft copy created. Review its options and contents before publishing.")}`);
}

export async function archiveProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const exists = db().prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!exists) return back("/admin/products", "Product not found.");
  db().prepare("UPDATE products SET status='archived', updated_at=datetime('now') WHERE id=?").run(id);
  logAdminActivity(a.email, "product_archived", "product", id);
  revalidatePath("/", "layout");
  back("/admin/products", "Product archived. Historical order records were retained.");
}

export async function bulkProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const action = s(f, "action", 20);
  const ids = [...new Set(f.getAll("productIds").map((value) => Number(value)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length || ids.length > 100) return back("/admin/products", "Select between 1 and 100 products.");
  if (!["publish", "draft", "archive", "feature", "unfeature"].includes(action)) return back("/admin/products", "Choose a valid bulk action.");
  const placeholders = ids.map(() => "?").join(",");
  const found = db().prepare(`SELECT id,name FROM products WHERE id IN (${placeholders})`).all(...ids);
  if (found.length !== ids.length) return back("/admin/products", "One or more selected products could not be found. Reload and try again.");
  if (action === "publish") {
    const notReady = db().prepare(`SELECT p.name FROM products p WHERE p.id IN (${placeholders}) AND NOT EXISTS
      (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.status='active' AND v.needs_confirmation=0)`).all(...ids);
    if (notReady.length) return back("/admin/products", `Cannot publish products without a confirmed active price: ${notReady.map((p) => String(p.name)).join(", ")}.`);
  }
  const update = action === "publish" ? "status='published'" : action === "draft" ? "status='draft'" : action === "archive" ? "status='archived'" : action === "feature" ? "featured=1" : "featured=0";
  tx((d) => d.prepare(`UPDATE products SET ${update},updated_at=datetime('now') WHERE id IN (${placeholders})`).run(...ids));
  logAdminActivity(a.email, `products_bulk_${action}`, "product", ids.join(","), `${ids.length} product records updated`);
  revalidatePath("/", "layout");
  back("/admin/products", `${ids.length} products updated.`);
}

export async function createCategoryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const name = s(f, "name", 80);
  if (name.length < 2) return back("/admin/categories", "Enter a category name.");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  if (!slug) return back("/admin/categories", "Use a category name containing letters or numbers.");
  if (db().prepare("SELECT 1 FROM categories WHERE slug = ?").get(slug)) return back("/admin/categories", "A category already uses that web address.");
  const r = db().prepare("INSERT INTO categories (slug,name,description,image,sort,status) VALUES (?,?,?,'',?,'hidden')")
    .run(slug, name, text(f, "description", 1000), Number(f.get("sort")) || 0);
  logAdminActivity(a.email, "category_created", "category", Number(r.lastInsertRowid), name);
  back("/admin/categories", "Category created hidden. Review its details and publish it when ready.");
}

export async function saveCategoryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return back("/admin/categories", "Choose a valid category.");
  const current = db().prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!current) return back("/admin/categories", "Category not found.");
  const slug = s(f, "slug", 70).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
  const duplicate = db().prepare("SELECT 1 FROM categories WHERE slug = ? AND id != ?").get(slug, id);
  const name = s(f, "name", 80);
  if (!slug || duplicate || name.length < 2) return back("/admin/categories", "Enter a category name and a unique URL slug.");
  const status = f.get("status") === "published" ? "published" : "hidden";
  const image = s(f, "image", 300);
  if (image && !image.startsWith("/images/") && !/^\/media\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image))
    return back("/admin/categories", "Choose a project image path or an uploaded media URL.");
  tx((d) => {
    if (slug !== current.slug) {
      d.prepare("UPDATE products SET category=?,updated_at=datetime('now') WHERE category=?").run(slug, current.slug);
      d.prepare("UPDATE category_redirects SET new_slug=? WHERE new_slug=?").run(slug, current.slug);
      d.prepare("INSERT INTO category_redirects (old_slug,new_slug) VALUES (?,?) ON CONFLICT(old_slug) DO UPDATE SET new_slug=excluded.new_slug").run(current.slug, slug);
    }
    d.prepare(`UPDATE categories SET slug=?,name=?,description=?,image=?,seo_title=?,meta_description=?,status=?,sort=?,updated_at=datetime('now') WHERE id=?`)
      .run(slug, name, text(f, "description", 1000), image, s(f, "seoTitle", 120), text(f, "metaDescription", 300), status, Number(f.get("sort")) || 0, id);
  });
  logAdminActivity(a.email, "category_updated", "category", id, `${String(current.slug)} → ${slug}; ${status}`);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(current.slug)}`);
  revalidatePath(`/category/${slug}`);
  back("/admin/categories", "Category saved.");
}

export async function deleteCategoryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return back("/admin/categories", "Choose a valid category.");
  const category = db().prepare("SELECT id,slug,name FROM categories WHERE id=?").get(id);
  if (!category) return back("/admin/categories", "Category not found.");
  const used = Number(db().prepare("SELECT COUNT(*) n FROM products WHERE category=?").get(category.slug)?.n || 0);
  const targetSlug = s(f, "targetSlug", 70);
  const target = targetSlug ? db().prepare("SELECT slug FROM categories WHERE slug=? AND id<>? AND status='published'").get(targetSlug, id) : null;
  if (used && !target) return back("/admin/categories", `Choose a published category to receive ${used} assigned products before deleting ${String(category.name)}.`);
  tx((d) => {
    if (target) d.prepare("UPDATE products SET category=?,updated_at=datetime('now') WHERE category=?").run(target.slug, category.slug);
    d.prepare("DELETE FROM categories WHERE id=?").run(id);
    const redirectTo = target ? String(target.slug) : "/shop";
    d.prepare("UPDATE category_redirects SET new_slug=? WHERE new_slug=?").run(redirectTo, category.slug);
    d.prepare("INSERT INTO category_redirects (old_slug,new_slug) VALUES (?,?) ON CONFLICT(old_slug) DO UPDATE SET new_slug=excluded.new_slug").run(category.slug, redirectTo);
  });
  logAdminActivity(a.email, "category_deleted", "category", id, `${String(category.name)}; reassigned ${used} products`);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(category.slug)}`);
  back("/admin/categories", used ? `Category deleted and ${used} products reassigned. Its old URL redirects to ${String(target?.slug)}.` : "Empty category deleted. Its old URL redirects to the shop.");
}

export async function uploadCategoryImageAction(f: FormData) {
  await requireAdmin("owner");
  const id = Number(f.get("id"));
  const category = db().prepare("SELECT slug FROM categories WHERE id = ?").get(id);
  if (!category) return back("/admin/categories", "Category not found.");
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return back("/admin/categories", "Choose an image to upload.");
  if (file.size > 6 * 1024 * 1024) return back("/admin/categories", "The image must be 6 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type || type === "pdf") return back("/admin/categories", "Upload a JPG, PNG or WebP image.");
  const name = `${randomBytes(12).toString("hex")}.${type}`;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), buf, { flag: "wx", mode: 0o644 });
  const image = `/media/${name}`;
  db().prepare("UPDATE categories SET image=?,updated_at=datetime('now') WHERE id=?").run(image, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(category.slug)}`);
  back("/admin/categories", "Category image uploaded and saved.");
}

export async function saveProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const p = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!p) return back("/admin/products");
  const slug = s(f, "slug", 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!slug || db().prepare("SELECT 1 FROM products WHERE slug = ? AND id != ?").get(slug, id)) return back(`/admin/products/${id}`, "That web address (slug) is empty or already used.");
  const category = s(f, "category", 70);
  if (!db().prepare("SELECT 1 FROM categories WHERE slug = ?").get(category)) return back(`/admin/products/${id}`, "Choose an existing category.");
  const status = STATUSES.includes(s(f, "status", 30)) ? s(f, "status", 30) : "draft";
  if (status === "published" && !db().prepare("SELECT 1 FROM variants WHERE product_id = ? AND status = 'active'").get(id))
    return back(`/admin/products/${id}`, "Add at least one active price option before you publish.");
  const faqs = text(f, "faqs", 6000).split(/\n{2,}/).map((b) => b.split("\n")).filter((b) => b[0]?.startsWith("Q:")).map((b) => ({ q: b[0].slice(2).trim(), a: b.slice(1).join(" ").replace(/^A:\s*/, "").trim() })).filter((x) => x.q && x.a);
  const related = s(f, "related", 500).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  db().prepare(
    `UPDATE products SET name=?, slug=?, category=?, short_description=?, description=?, information=?, ingredients=?, directions=?, faqs=?, related=?,
     status=?, featured=?, sort=?, review_note=?, updated_at=datetime('now') WHERE id=?`
  ).run(s(f, "name", 120), slug, category, s(f, "short", 300), text(f, "description"), text(f, "information"),
    text(f, "ingredients", 2000), text(f, "directions", 4000), JSON.stringify(faqs), JSON.stringify(related), status, f.get("featured") ? 1 : 0,
    Number(f.get("sort")) || 0, text(f, "review", 2000), id);
  revalidatePath("/", "layout");
  logAdminActivity(a.email, "product_updated", "product", id, `${String(p.name)} · ${slug} · ${status}`);
  back(`/admin/products/${id}`, "Product saved.");
}

export async function saveVariantAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const vid = Number(f.get("variantId")) || 0;
  const label = s(f, "label", 60);
  const price = money(f.get("price"));
  const saleRaw = String(f.get("salePrice") ?? "").trim();
  const sale = saleRaw ? money(saleRaw) : null;
  const stockRaw = String(f.get("stock") ?? "").trim();
  const stock = stockRaw === "" ? null : Number(stockRaw);
  if (stockRaw && (!/^\d+$/.test(stockRaw) || !Number.isSafeInteger(stock) || Number(stock) > 1_000_000)) return back(`/admin/products/${pid}`, "Stock must be a whole number between 0 and 1,000,000, or blank to disable tracking.");
  if (!label || price == null || price < 1) return back(`/admin/products/${pid}`, "Each price option needs a name and a price.");
  if (sale != null && sale >= price) return back(`/admin/products/${pid}`, "The sale price must be lower than the price.");
  const status = ["active", "inactive"].includes(s(f, "status", 20)) ? s(f, "status", 20) : "active";
  let sku = s(f, "sku", 60).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!sku) sku = `WX-${pid}-${label.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  if (db().prepare("SELECT 1 FROM variants WHERE sku = ? AND id != ?").get(sku, vid)) return back(`/admin/products/${pid}`, `SKU ${sku} is already used.`);
  const vals = [label, s(f, "size", 60), s(f, "duration", 60), sku, price, sale, stock, status, f.get("confirmed") ? 0 : 1, Number(f.get("sort")) || 0];
  tx((d) => {
    if (vid) {
      const previous = d.prepare("SELECT * FROM variants WHERE id=? AND product_id=?").get(vid,pid);
      if (!previous) throw new Error("variant:not-found");
      const oldStock = previous.stock == null ? null : Number(previous.stock);
      d.prepare("UPDATE variants SET label=?, size=?, duration=?, sku=?, price=?, sale_price=?, stock=?, status=?, needs_confirmation=?, sort=? WHERE id=? AND product_id=?").run(...vals, vid, pid);
      if (oldStock !== stock && (oldStock != null || stock != null)) {
        const product = d.prepare("SELECT name FROM products WHERE id=?").get(pid);
        const before = oldStock ?? 0;
        const after = stock ?? 0;
        d.prepare(`INSERT INTO inventory_movements
          (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(pid,vid,product?.name || "",label,sku,before,after,after-before,
            oldStock == null ? "Opening stock set in product editor" : stock == null ? "Stock tracking disabled in product editor" : "Stock adjusted in product editor",a.email);
      }
    } else {
      const result = d.prepare("INSERT INTO variants (label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,sort,product_id,price_source) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'Added in admin')").run(...vals, pid);
      if (stock != null) {
        const product = d.prepare("SELECT name FROM products WHERE id=?").get(pid);
        d.prepare(`INSERT INTO inventory_movements
          (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(pid,Number(result.lastInsertRowid),product?.name || "",label,sku,0,stock,stock,"Opening stock set in product editor",a.email);
      }
    }
  });
  db().prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").run(pid);
  logAdminActivity(a.email, "variant_saved", "product", pid, `${label} · ${sku}`);
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, "Price option saved.");
}

export async function deleteVariantAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const vid = Number(f.get("variantId"));
  const used = db().prepare("SELECT 1 FROM order_items WHERE variant_id = ?").get(vid);
  if (used) db().prepare("UPDATE variants SET status = 'inactive' WHERE id = ?").run(vid);
  else db().prepare("DELETE FROM variants WHERE id = ? AND product_id = ?").run(vid, pid);
  back(`/admin/products/${pid}`, used ? "This option has past orders, so it was switched off instead of deleted." : "Price option deleted.");
}

export async function saveStockAction(f: FormData) {
  const a = await requireAdmin("owner");
  const variantId = Number(f.get("variantId"));
  const raw = String(f.get("stock") ?? "").trim();
  const thresholdRaw = String(f.get("threshold") ?? "0").trim();
  const qty = Number(raw);
  const threshold = Number(thresholdRaw);
  const reason = s(f, "reason", 160);
  if (!Number.isInteger(variantId) || variantId < 1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(qty) || qty > 1_000_000)
    return back("/admin/inventory", "Enter a whole stock quantity between 0 and 1,000,000.");
  if (!/^\d+$/.test(thresholdRaw) || !Number.isSafeInteger(threshold) || threshold > 1_000_000)
    return back("/admin/inventory", "Enter a whole low-stock threshold between 0 and 1,000,000.");
  if (reason.length < 3) return back("/admin/inventory", "Add a short reason for this stock adjustment.");
  const result = tx((d) => {
    const row = d.prepare(`SELECT v.*,p.name product_name FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?`).get(variantId);
    if (!row) return null;
    const previous = row.stock == null ? 0 : Number(row.stock);
    d.prepare("UPDATE variants SET stock=?,low_stock_threshold=? WHERE id=?").run(qty, threshold, variantId);
    let movementId: number | null = null;
    if (previous !== qty) {
      movementId = Number(d.prepare(`INSERT INTO inventory_movements
        (product_id,variant_id,product_name,variant_label,sku,previous_qty,new_qty,qty_change,reason,actor)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(row.product_id,row.id,row.product_name,row.label,row.sku,previous,qty,qty-previous,
          row.stock == null ? `Opening stock: ${reason}` : reason,a.email).lastInsertRowid);
    }
    return { productId: Number(row.product_id), productName: String(row.product_name), label: String(row.label), qty, threshold, movementId };
  });
  if (result == null) return back("/admin/inventory", "Stock option not found.");
  if (result.movementId != null) {
    logAdminActivity(a.email, "stock_adjusted", "variant", variantId, `${result.productName} · ${result.label}: ${qty} (${reason})`);
    if (threshold > 0 && qty <= threshold) {
      notifyAdmin(`stock:${result.movementId}:low`, "low_stock", qty === 0 ? "Product out of stock" : "Product stock is low", `${result.productName} · ${result.label}: ${qty} remaining`, "/admin/inventory");
    }
  }
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${result.productId}`);
  back("/admin/inventory", "Stock saved and movement recorded.");
}

export async function saveComboItemsAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const rows: { pid: number | null; name: string; size: string; qty: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const name = s(f, `item_name_${i}`, 100);
    const ref = Number(f.get(`item_pid_${i}`)) || null;
    if (!name && !ref) continue;
    const refName = ref ? String(db().prepare("SELECT name FROM products WHERE id = ?").get(ref)?.name || "") : "";
    rows.push({ pid: ref, name: name || refName, size: s(f, `item_size_${i}`, 80), qty: s(f, `item_qty_${i}`, 80) });
  }
  tx((d) => {
    d.prepare("DELETE FROM combo_items WHERE combo_id = ?").run(pid);
    rows.forEach((r, i) => d.prepare("INSERT INTO combo_items (combo_id,item_product_id,item_name,size_note,quantity_note,sort) VALUES (?,?,?,?,?,?)").run(pid, r.pid, r.name, r.size, r.qty, i));
  });
  logAdminActivity(a.email, "combo_contents_updated", "product", pid, `${rows.length} set items`);
  back(`/admin/products/${pid}`, "Set contents saved.");
}

export async function uploadImageAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  if (!Number.isSafeInteger(pid) || pid < 1) return back("/admin/products", "Choose a valid product.");
  const product = db().prepare("SELECT name,images FROM products WHERE id=?").get(pid);
  if (!product) return back("/admin/products", "Product not found.");
  const files = f.getAll("images").filter((v): v is File => typeof v !== "string" && v.size > 0);
  if (!files.length) return back(`/admin/products/${pid}`, "Choose one or more images to upload.");
  if (files.length > 12) return back(`/admin/products/${pid}`, "Upload up to 12 images at a time.");
  if (files.some((file) => file.size > 6 * 1024 * 1024)) return back(`/admin/products/${pid}`, "Each image must be 6 MB or smaller.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 7 * 1024 * 1024) return back(`/admin/products/${pid}`, "The total upload must be 7 MB or smaller.");
  const checked: { buf: Buffer; type: string }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniffType(buf);
    if (!type || type === "pdf") return back(`/admin/products/${pid}`, "Upload JPG, PNG or WebP images only.");
    checked.push({ buf, type });
  }
  const uploaded: { src: string }[] = [];
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  for (const { buf, type } of checked) {
    const name = `${randomBytes(12).toString("hex")}.${type}`;
    const target = path.join(MEDIA_DIR, name);
    await fs.writeFile(target, buf, { flag: "wx", mode: 0o644 });
    uploaded.push({ src: `/media/${name}` });
  }
  const imgs = JSON.parse(String(product.images || "[]")) as string[];
  uploaded.forEach((item) => imgs.push(item.src));
  tx((d) => {
    d.prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
    uploaded.forEach((item, i) => d.prepare("INSERT INTO product_media(product_id,src,alt_text,sort) VALUES (?,?,?,?)")
      .run(pid, item.src, String(product.name), imgs.length - uploaded.length + i));
  });
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, `${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.`);
}

export async function assignExistingImageAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const src = s(f, "src", 300);
  if (!Number.isSafeInteger(pid) || pid < 1) return back("/admin/media", "Choose a valid product.");
  const product = db().prepare("SELECT name,images FROM products WHERE id=?").get(pid);
  if (!product) return back("/admin/products", "Product not found.");
  if (!/^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(src) && !/^\/media\/[a-f0-9]{24}\.(?:jpg|png|webp)$/i.test(src))
    return back("/admin/media", "Choose an image from the library.");
  const target = src.startsWith("/media/") ? path.join(MEDIA_DIR, path.basename(src)) : path.join(process.cwd(), "public", src.slice(1));
  try { await fs.access(target); } catch { return back("/admin/media", "That image file could not be found."); }
  const images = JSON.parse(String(product.images || "[]")) as string[];
  if (images.includes(src)) return back(`/admin/products/${pid}`, "That image is already assigned to this product.");
  images.push(src);
  tx((d) => {
    d.prepare("UPDATE products SET images=?,updated_at=datetime('now') WHERE id=?").run(JSON.stringify(images), pid);
    d.prepare(`INSERT INTO product_media(product_id,src,alt_text,sort) VALUES (?,?,?,?)
      ON CONFLICT(product_id,src) DO UPDATE SET sort=excluded.sort,updated_at=datetime('now')`)
      .run(pid, src, String(product.name), images.length - 1);
  });
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, "Image added from the media library.");
}

export async function assignCategoryImageAction(f: FormData) {
  await requireAdmin("owner");
  const id = Number(f.get("categoryId"));
  const src = s(f, "src", 300);
  if (!Number.isSafeInteger(id) || id < 1) return back("/admin/media", "Choose a valid category.");
  const category = db().prepare("SELECT slug FROM categories WHERE id=?").get(id);
  if (!category) return back("/admin/categories", "Category not found.");
  if (!/^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(src) && !/^\/media\/[a-f0-9]{24}\.(?:jpg|png|webp)$/i.test(src))
    return back("/admin/media", "Choose an image from the library.");
  const target = src.startsWith("/media/") ? path.join(MEDIA_DIR, path.basename(src)) : path.join(process.cwd(), "public", src.slice(1));
  try { if (!(await fs.stat(target)).isFile()) throw new Error("Not a file"); } catch { return back("/admin/media", "That image file could not be found."); }
  db().prepare("UPDATE categories SET image=?,updated_at=datetime('now') WHERE id=?").run(src, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(category.slug)}`);
  back("/admin/categories", "Category image selected from the media library.");
}

export async function saveProductImageMetaAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const src = s(f, "src", 300);
  const alt = s(f, "alt", 160);
  const caption = s(f, "caption", 160);
  if (!Number.isSafeInteger(pid) || pid < 1) return back("/admin/products", "Choose a valid product.");
  const product = db().prepare("SELECT name,images FROM products WHERE id=?").get(pid);
  if (!product) return back("/admin/products", "Product not found.");
  const images = JSON.parse(String(product.images || "[]")) as string[];
  const index = images.indexOf(src);
  if (index < 0) return back(`/admin/products/${pid}`, "That image is no longer assigned to this product. Reload the editor and try again.");
  db().prepare(`INSERT INTO product_media(product_id,src,alt_text,caption,sort) VALUES (?,?,?,?,?)
    ON CONFLICT(product_id,src) DO UPDATE SET alt_text=excluded.alt_text,caption=excluded.caption,sort=excluded.sort,updated_at=datetime('now')`)
    .run(pid, src, alt || String(product.name), caption, index);
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, "Image alt text and caption saved.");
}

export async function imageOrderAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const op = s(f, "op", 10);
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(idx) || !["remove", "first", "up", "down"].includes(op)) return back("/admin/products", "Choose a valid image action.");
  const p = db().prepare("SELECT images,name FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return back(`/admin/products/${pid}`);
  if (op === "remove") imgs.splice(idx, 1);
  if (op === "first") imgs.unshift(...imgs.splice(idx, 1));
  if (op === "up" && idx > 0) [imgs[idx - 1], imgs[idx]] = [imgs[idx], imgs[idx - 1]];
  if (op === "down" && idx < imgs.length - 1) [imgs[idx + 1], imgs[idx]] = [imgs[idx], imgs[idx + 1]];
  tx((d) => {
    d.prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
    if (op === "remove") d.prepare("DELETE FROM product_media WHERE product_id=? AND src=?").run(pid, String(JSON.parse(String(p?.images || "[]"))[idx]));
    imgs.forEach((src, sort) => d.prepare(`INSERT INTO product_media(product_id,src,alt_text,sort) VALUES (?,?,?,?)
      ON CONFLICT(product_id,src) DO UPDATE SET sort=excluded.sort`).run(pid, src, String(p?.name || "Product image"), sort));
  });
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, op === "remove" ? "Image removed from this product." : "Main image updated.");
}

/* ---------- delivery ---------- */
export async function saveDeliveryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const updates = NIGERIAN_STATES.map((state) => {
    const raw = String(f.get(`fee_${state}`) ?? "").trim();
    const fee = raw === "" ? null : money(raw);
    return { state, raw, fee, active: f.get(`active_${state}`) ? 1 : 0, note: s(f, `note_${state}`, 120), estimate: s(f, `estimate_${state}`, 80) };
  });
  if (updates.some((x) => x.raw !== "" && (!/^\d+$/.test(x.raw) || x.fee == null))) return back("/admin/delivery", "Enter a whole delivery fee for each configured state, or leave it blank to keep it unconfigured.");
  tx((d) => {
    for (const x of updates) {
      const previous = d.prepare("SELECT fee,active,note,estimated_delivery FROM delivery_zones WHERE state=?").get(x.state);
      const nextConfig = { fee: x.fee, active: x.active, note: x.note, estimated_delivery: x.estimate };
      if (!previous || JSON.stringify(previous) !== JSON.stringify(nextConfig)) {
        d.prepare("INSERT INTO delivery_zone_history (state,previous_config,new_config,actor) VALUES (?,?,?,?)")
          .run(x.state, JSON.stringify(previous || {}), JSON.stringify(nextConfig), a.email);
      }
      d.prepare("INSERT INTO delivery_zones (state, fee, active, note, estimated_delivery) VALUES (?,?,?,?,?) ON CONFLICT(state) DO UPDATE SET fee=excluded.fee, active=excluded.active, note=excluded.note, estimated_delivery=excluded.estimated_delivery")
        .run(x.state, x.fee, x.active, x.note, x.estimate);
    }
  });
  logAdminActivity(a.email, "delivery_settings_updated", "delivery", "all-states", `${updates.filter((x) => x.fee != null).length} configured fees`);
  revalidatePath("/checkout");
  back("/admin/delivery", "Delivery fees saved.");
}

export async function importDeliveryCsvAction(f: FormData) {
  const a = await requireAdmin("owner");
  if (f.get("confirm") !== "yes") return back("/admin/delivery", "Confirm the import before applying CSV changes.");
  const csv = String(f.get("csv") ?? "");
  const parsed = parseDeliveryCsv(csv);
  if (parsed.errors.length) return back("/admin/delivery", parsed.errors.slice(0, 3).join(" "));
  tx((d) => {
    for (const x of parsed.rows) {
      const active = x.active ? 1 : 0;
      const previous = d.prepare("SELECT fee,active,note,estimated_delivery FROM delivery_zones WHERE state=?").get(x.state);
      const nextConfig = { fee: x.fee, active, note: x.note, estimated_delivery: x.estimatedDelivery };
      if (!previous || JSON.stringify(previous) !== JSON.stringify(nextConfig)) {
        d.prepare("INSERT INTO delivery_zone_history (state,previous_config,new_config,actor) VALUES (?,?,?,?)")
          .run(x.state, JSON.stringify(previous || {}), JSON.stringify(nextConfig), a.email);
      }
      d.prepare("INSERT INTO delivery_zones (state,fee,active,note,estimated_delivery) VALUES (?,?,?,?,?) ON CONFLICT(state) DO UPDATE SET fee=excluded.fee,active=excluded.active,note=excluded.note,estimated_delivery=excluded.estimated_delivery")
        .run(x.state,x.fee,active,x.note,x.estimatedDelivery);
    }
  });
  logAdminActivity(a.email, "delivery_csv_imported", "delivery", "selected-states", `${parsed.rows.length} rows`);
  revalidatePath("/checkout");
  back("/admin/delivery", `Imported ${parsed.rows.length} state delivery setting${parsed.rows.length === 1 ? "" : "s"}.`);
}

export async function saveBulkDeliveryAction(f: FormData) {
  const a = await requireAdmin("owner");
  if (f.get("confirm") !== "yes") return back("/admin/delivery", "Confirm the bulk update before applying it.");
  const states = NIGERIAN_STATES.filter((state) => f.get(`state_${state}`) === "on");
  if (!states.length) return back("/admin/delivery", "Select at least one state.");
  const raw = String(f.get("fee") ?? "").trim();
  if (!/^\d+$/.test(raw) || money(raw) == null) return back("/admin/delivery", "Enter a valid whole-number delivery fee.");
  const fee = Number(raw);
  tx((d) => {
    for (const state of states) {
      const previous = d.prepare("SELECT fee,active,note,estimated_delivery FROM delivery_zones WHERE state=?").get(state);
      const nextConfig = { fee, active: previous?.active ?? 1, note: previous?.note ?? "", estimated_delivery: previous?.estimated_delivery ?? "" };
      if (!previous || JSON.stringify(previous) !== JSON.stringify(nextConfig)) {
        d.prepare("INSERT INTO delivery_zone_history (state,previous_config,new_config,actor) VALUES (?,?,?,?)")
          .run(state, JSON.stringify(previous || {}), JSON.stringify(nextConfig), a.email);
      }
      d.prepare("INSERT INTO delivery_zones (state,fee,active,note,estimated_delivery) VALUES (?,?,?,?,?) ON CONFLICT(state) DO UPDATE SET fee=excluded.fee")
        .run(state, fee, nextConfig.active, nextConfig.note, nextConfig.estimated_delivery);
    }
  });
  logAdminActivity(a.email, "delivery_fees_bulk_updated", "delivery", "selected-states", `${states.length} states · ₦${fee.toLocaleString("en-NG")}`);
  revalidatePath("/checkout");
  back("/admin/delivery", `Updated the delivery fee for ${states.length} selected state${states.length === 1 ? "" : "s"}.`);
}

/* ---------- settings ---------- */
export async function saveBankAction(f: FormData) {
  const a = await requireAdmin("owner");
  const bank = s(f, "bank", 80);
  const accountName = s(f, "accountName", 120);
  const accountNumber = s(f, "accountNumber", 20).replace(/\D/g, "");
  if (!bank || !accountName || !/^\d{10}$/.test(accountNumber)) return back("/admin/settings", "Enter the bank name, account name and a 10-digit account number.");
  setSetting("bank", { bank, accountName, accountNumber });
  logAdminActivity(a.email, "bank_details_updated", "settings", "bank", "Bank transfer destination updated");
  back("/admin/settings", "Bank details saved. New orders show these details.");
}
export async function saveContactAction(f: FormData) {
  const a = await requireAdmin("owner");
  const whatsapp = normalisePhone(s(f, "whatsapp", 30));
  const email = s(f, "email", 254).toLowerCase();
  if (!whatsapp) return back("/admin/settings", "Enter a valid Nigerian WhatsApp number.");
  if (email && !isEmail(email)) return back("/admin/settings", "Enter a valid email address.");
  const url = (k: string) => { const v = s(f, k, 200); return /^https:\/\/[^\s]+$/.test(v) ? v : ""; };
  setSetting("contact", { whatsapp, email, instagram: url("instagram"), facebook: url("facebook"), tiktok: url("tiktok") });
  logAdminActivity(a.email, "contact_settings_updated", "settings", "contact");
  revalidatePath("/", "layout");
  back("/admin/settings", "Contact details saved.");
}
export async function saveContentAction(f: FormData) {
  const a = await requireAdmin("owner");
  for (const k of ["announcement", "about", "productNotice", "shippingPolicy", "returnsPolicy", "privacyPolicy", "termsPolicy"]) {
    if (f.has(k)) setSetting(k, text(f, k, k === "announcement" ? 200 : 8000));
  }
  revalidatePath("/", "layout");
  logAdminActivity(a.email, "store_content_updated", "settings", "content");
  back("/admin/settings", "Content saved.");
}
export async function saveHomeContentAction(f: FormData) {
  const a = await requireAdmin("owner");
  const href = (key: string) => {
    const value = s(f, key, 200);
    return /^\/(?!\/)[^\\\s]*$/.test(value) ? value : null;
  };
  const hero = {
    homeHeroEyebrow: text(f, "homeHeroEyebrow", 80), homeHeroTitle: text(f, "homeHeroTitle", 100), homeHeroAccent: text(f, "homeHeroAccent", 80),
    homeHeroDescription: text(f, "homeHeroDescription", 500), homeHeroPrimaryLabel: text(f, "homeHeroPrimaryLabel", 40), homeHeroPrimaryHref: href("homeHeroPrimaryHref"),
    homeHeroSecondaryLabel: text(f, "homeHeroSecondaryLabel", 40), homeHeroSecondaryHref: href("homeHeroSecondaryHref"),
  };
  if (!hero.homeHeroTitle || !hero.homeHeroAccent || !hero.homeHeroDescription || !hero.homeHeroPrimaryLabel || !hero.homeHeroSecondaryLabel || !hero.homeHeroPrimaryHref || !hero.homeHeroSecondaryHref)
    return back("/admin/settings", "Keep the homepage headline, description, both button labels and valid internal links filled in.");
  const bannerImage = s(f, "homeBannerImage", 300);
  const publicImage = /^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(bannerImage);
  const mediaImage = /^\/media\/([a-f0-9]{24}\.(?:jpg|png|webp))$/.exec(bannerImage);
  if (bannerImage && !publicImage && !mediaImage)
    return back("/admin/settings", "Banner image must use an existing /images or uploaded /media path.");
  if (publicImage) {
    try { await fs.access(path.join(process.cwd(), "public", bannerImage.slice(1))); }
    catch { return back("/admin/settings", "That banner image does not exist in the website image library."); }
  }
  if (mediaImage) {
    try { await fs.access(path.join(MEDIA_DIR, mediaImage[1])); }
    catch { return back("/admin/settings", "That uploaded banner image could not be found."); }
  }
  const bannerHrefInput = s(f, "homeBannerHref", 200);
  const bannerHref = bannerHrefInput ? href("homeBannerHref") : "";
  const banner = {
    homeBannerEnabled: f.get("homeBannerEnabled") === "on", homeBannerTitle: text(f, "homeBannerTitle", 100), homeBannerBody: text(f, "homeBannerBody", 500),
    homeBannerButton: text(f, "homeBannerButton", 40), homeBannerHref: bannerHref, homeBannerImage: bannerImage,
  };
  if (bannerHref === null) return back("/admin/settings", "Banner link must be a valid internal path.");
  if (banner.homeBannerEnabled && (!banner.homeBannerTitle || (!!banner.homeBannerButton && !banner.homeBannerHref)))
    return back("/admin/settings", "An enabled banner needs a title. A button label is optional.");
  for (const [key, value] of Object.entries(hero)) setSetting(key, value);
  for (const [key, value] of Object.entries(banner)) setSetting(key, value);
  logAdminActivity(a.email, "homepage_content_updated", "settings", "homepage");
  revalidatePath("/");
  back("/admin/settings", "Homepage content saved.");
}

/* ---------- users ---------- */
export async function addUserAction(f: FormData) {
  const a = await requireAdmin("owner");
  const email = s(f, "email", 254).toLowerCase();
  const name = s(f, "name", 80);
  const pw = String(f.get("password") || "");
  const role = f.get("role") === "owner" ? "owner" : "staff";
  if (!isEmail(email) || name.length < 2) return back("/admin/users", "Enter a name and a valid email.");
  if (pw.length < 10) return back("/admin/users", "The password must be at least 10 characters.");
  if (db().prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return back("/admin/users", "A user with that email already exists.");
  const result = db().prepare("INSERT INTO users (email,name,role,password_hash) VALUES (?,?,?,?)").run(email, name, role, hashPassword(pw));
  logAdminActivity(a.email, "admin_user_created", "user", Number(result.lastInsertRowid), `${email} · ${role}`);
  back("/admin/users", "User added.");
}
export async function toggleUserAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const user = db().prepare("SELECT email,active FROM users WHERE id=?").get(id);
  if (!user) return back("/admin/users", "User not found.");
  db().prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(id);
  logAdminActivity(a.email, Number(user.active) ? "admin_user_deactivated" : "admin_user_activated", "user", id, String(user.email));
  back("/admin/users", "User updated.");
}
export async function resetUserPasswordAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pw = String(f.get("password") || "");
  if (pw.length < 10) return back("/admin/users", "The password must be at least 10 characters.");
  const id = Number(f.get("id"));
  const user = db().prepare("SELECT email FROM users WHERE id=?").get(id);
  if (!user) return back("/admin/users", "User not found.");
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), id);
  logAdminActivity(a.email, "admin_password_reset", "user", id, String(user.email));
  back("/admin/users", "Password changed.");
}
