"use server";
import path from "path";
import { promises as fs } from "fs";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/lib/db";
import { hashPassword, login, logout, requirePerm } from "@/lib/auth";
import { isPermission } from "@/lib/permissions";
import { getOrderById, logEvent, orderItems } from "@/lib/orders";
import { adjustStock, recordMovement, releaseOrderStock, reserveOrderStock, type AdjustKind } from "@/lib/inventory";
import { deliveryZones, setSetting } from "@/lib/settings";
import { deleteMedia, getMedia, saveImageUpload } from "@/lib/media";
import { sendStorePurchase } from "@/lib/meta";
import { sendFunnelPurchase, sendTikTokPurchase } from "@/lib/capi-funnel";
import { confirmationsDb } from "@/lib/payment-confirmations";
import { clean, isEmail, sniffType } from "@/lib/validate";
import { ipOf, limited } from "@/lib/ratelimit";
import { NIGERIAN_STATES, normalisePhone, site } from "@/lib/site";
import { logAdminActivity } from "@/lib/admin-events";
import { ensureInvoice } from "@/lib/invoices";
import { safeImage, safeLink } from "@/lib/banners";
import { validFromPath, validToPath } from "@/lib/seo";

const s = (f: FormData, k: string, max = 500) => clean(f.get(k), max);
const text = (f: FormData, k: string, max = 8000) => {
  const v = f.get(k);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
};
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n) : null;
};
/** Activity log entry for a completed admin change. The record id comes from the submitted form. */
const audit = (a: { email: string }, action: string, f: FormData, details = "") => {
  const key = ["id", "productId", "variantId", "userId"].find((k) => f.get(k));
  const name = action.replace(/Action$/, "");
  const type = (["Category", "Variant", "Combo", "Product", "Image", "Media", "Stock", "Threshold", "Delivery", "Bank", "Contact", "Content", "User"]
    .find((t) => name.includes(t)) || "Settings").toLowerCase();
  logAdminActivity(a.email, name.replace(/([A-Z])/g, "_$1").toLowerCase(), type, key ? String(f.get(key)) : "", details);
};
/** Validation failure: like back(), and tells the form to restore what the admin typed. */
const fail = (url: string, msg?: string, field?: string) => {
  const [path, hash] = url.split("#");
  return back(`${path}${path.includes("?") ? "&" : "?"}err=1${hash ? "#" + hash : ""}`, msg, field);
};
/** Redirect back with a message. `field` names the input to highlight. */
const back = (url: string, msg?: string, field?: string) => {
  const [path, hash] = url.split("#");
  const q = msg ? `msg=${encodeURIComponent(msg)}${field ? `&field=${encodeURIComponent(field)}` : ""}` : "";
  return redirect(q ? `${path}${path.includes("?") ? "&" : "?"}${q}${hash ? "#" + hash : ""}` : url);
};

/* ---------- auth ---------- */
export async function loginAction(_: unknown, f: FormData) {
  const ip = ipOf({ headers: await headers() });
  const email = s(f, "email", 254);
  if (limited("login:" + ip, 6, 10 * 60_000)) return { error: "Too many attempts. Wait 10 minutes and try again.", email };
  const ok = await login(email, String(f.get("password") || "").slice(0, 200));
  if (!ok) return { error: "Email or password is not correct.", email };
  redirect("/admin");
}
export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

/* ---------- orders ---------- */
export async function setDeliveryFeeAction(f: FormData) {
  const a = await requirePerm("payments");
  const id = Number(f.get("id"));
  const fee = money(f.get("fee"));
  const o = getOrderById(id);
  if (!o || fee == null) return fail(`/admin/orders/${id}`, "Enter a valid delivery fee.", "fee");
  if (o.payment_status === "paid") return fail(`/admin/orders/${id}`, "Payment for this order is already confirmed. The delivery fee can no longer change.");
  if (o.delivery_payment_status === "paid") return fail(`/admin/orders/${id}`, "Delivery payment is already confirmed.");
  if (o.delivery_fee_source === "free_delivery") return fail(`/admin/orders/${id}`, "This order has free delivery. There is no delivery fee to set.");
  // The customer pays one total (products + delivery) to the store. The store settles the delivery agent itself.
  db().prepare("UPDATE orders SET delivery_fee = ?, total = subtotal + ?, delivery_payment_status = 'not_required', delivery_fee_source = 'included_in_order', updated_at = datetime('now') WHERE id = ?").run(fee, fee, id);
  logEvent(id, a.email, "delivery_fee_set", `₦${fee.toLocaleString()}${o.delivery_fee != null ? ` (was ₦${Number(o.delivery_fee).toLocaleString()})` : ""}`);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, "Delivery fee saved and included in the order total. The customer's order page now shows the amount to pay.");
}

export async function verifyPaymentAction(f: FormData) {
  const a = await requirePerm("payments");
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o) return fail("/admin/orders");
  if (f.get("confirm") !== "yes") return fail(`/admin/orders/${id}`, "Tick the box to confirm you have seen the money in the bank account.", "confirm");
  if (o.payment_status === "paid") return fail(`/admin/orders/${id}`, "Payment is already confirmed.");
  if (o.fulfilment_status === "cancelled") return fail(`/admin/orders/${id}`, "This order is cancelled. Reopen it before confirming a payment for it.");
  // Atomic claim: only the first confirmation wins. A concurrent double-click gets changes=0 and sends nothing.
  const claimed = db().prepare("UPDATE orders SET payment_status = 'paid', paid_at = datetime('now'), verified_by = ?, updated_at = datetime('now') WHERE id = ? AND payment_status != 'paid'").run(a.email, id);
  if (Number(claimed.changes) !== 1) return fail(`/admin/orders/${id}`, "Payment is already confirmed.");
  logEvent(id, a.email, "payment_verified", s(f, "note", 300));
  ensureInvoice(id, a.email);
  const items = orderItems(id);
  const skus = items.map((i) => i.sku);
  const eventItems = items.map((i) => ({ id: i.sku, name: i.name, price: Number(i.unit_price), qty: Number(i.qty) }));
  // Cross-path guard: the payment-confirmation screen can verify the same payment as this order screen.
  // If a paid confirmation for this order already sent a production Purchase to a platform, that platform
  // must not receive a second one from here — the two screens are two views of one payment.
  const confRows = confirmationsDb().prepare("SELECT purchase_event_status, tiktok_event_status FROM payment_confirmations WHERE order_number = ? AND status = 'paid'").all(o.number) as { purchase_event_status?: string; tiktok_event_status?: string }[];
  const confMetaSent = confRows.some((c) => c.purchase_event_status === "sent");
  const confTtSent = confRows.some((c) => c.tiktok_event_status === "sent");
  // One PRODUCTION Purchase per order: only an exact "sent" counts. A "sent_test" event went to Meta Test Events
  // only, so it must never suppress the real production Purchase (nor be rewritten as if it were production).
  const prevStatus = String((o as { purchase_event_status?: unknown }).purchase_event_status || "");
  const already = prevStatus === "sent" || confMetaSent;
  let trk: Record<string, unknown> = {};
  try { trk = JSON.parse(String(o.tracking || "{}")); } catch {}
  if (trk.funnel) {
    // Landing-page funnel order: Purchase goes to Meta (Edith Pixel 1) and TikTok, once each, only now that an admin confirmed the payment.
    const fr = await sendFunnelPurchase({ number: o.number, total: Number(o.total ?? o.subtotal), phone: String(o.phone), tracking: JSON.stringify(trk), url: `${site.url}/order/${o.number}`, skipMeta: already, skipTikTok: String(trk.tt_status || "") === "sent" || confTtSent, items: eventItems });
    if (!already) db().prepare("UPDATE orders SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(fr.eventId, fr.meta, id);
    if (String(trk.tt_status || "") !== "sent") db().prepare("UPDATE orders SET tracking = ? WHERE id = ?").run(JSON.stringify({ ...trk, tt_status: fr.tiktok }), id);
    logEvent(id, "system", "purchase_events", `Meta: ${already ? "already sent" : fr.meta}. TikTok: ${String(trk.tt_status || "") === "sent" ? "already sent" : fr.tiktok}.`);
    revalidatePath("/admin");
    return back(`/admin/orders/${id}`, "Payment confirmed. The order is now Paid.");
  }
  // When a production Purchase was already sent, keep the original event id and status untouched.
  const storeValue = o.delivery_fee_source === "included_in_order" ? Number(o.total) : o.subtotal;
  if (!already) {
    const ev = await sendStorePurchase({ number: o.number, total: storeValue, skus, url: `${site.url}/order/${o.number}`, tracking: String(o.tracking || "{}") });
    db().prepare("UPDATE orders SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(ev.eventId, ev.status, id);
  }
  // Store orders also send a server-side TikTok Purchase with the same stable event id ("pu_<order number>").
  // The TikTok browser pixel fires PageView only, so there is no browser/server duplicate. Its status is kept
  // separately in the order's tracking JSON, and a TikTok failure never affects the payment or the Meta result.
  if (String(trk.tt_status || "") !== "sent" && !confTtSent) {
    const tt = await sendTikTokPurchase({ name: "Purchase", eventId: "pu_" + o.number, number: o.number, phone: String(o.phone), value: storeValue, url: `${site.url}/order/${o.number}`, tracking: JSON.stringify(trk), items: eventItems });
    db().prepare("UPDATE orders SET tracking = ? WHERE id = ?").run(JSON.stringify({ ...trk, tt_status: tt }), id);
    logEvent(id, "system", "purchase_events_tiktok", `TikTok: ${tt}.`);
  }
  revalidatePath("/admin");
  back(`/admin/orders/${id}`, "Payment confirmed. The order is now Paid.");
}

export async function markDeliveryPaidAction(f: FormData) {
  const a = await requirePerm("payments");
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o || o.delivery_fee == null) return fail(`/admin/orders/${id}`, "Set the delivery fee before recording payment.");
  if (f.get("confirm") !== "yes") return fail(`/admin/orders/${id}`, "Confirm you have seen the delivery payment in the account.", "confirm");
  if (o.delivery_payment_status === "paid") return fail(`/admin/orders/${id}`, "Delivery payment is already confirmed.");
  if (o.delivery_payment_status === "not_required") return fail(`/admin/orders/${id}`, "This order has free delivery. There is no delivery payment.");
  const reference = s(f, "reference", 120);
  db().prepare("UPDATE orders SET delivery_payment_status = 'paid', delivery_paid_at = datetime('now'), delivery_payment_reference = ?, updated_at = datetime('now') WHERE id = ?").run(reference, id);
  logEvent(id, a.email, "delivery_payment_verified", reference || `₦${Number(o.delivery_fee).toLocaleString("en-NG")}`);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, "Delivery payment recorded.");
}

export async function markPaymentFailedAction(f: FormData) {
  const a = await requirePerm("payments");
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o || o.payment_status === "paid") return fail(`/admin/orders/${id}`, "Paid orders cannot be marked as failed.");
  db().prepare("UPDATE orders SET payment_status = 'payment_failed', updated_at = datetime('now') WHERE id = ?").run(id);
  logEvent(id, a.email, "payment_failed", s(f, "note", 300));
  back(`/admin/orders/${id}`, "Marked as Payment Failed. The customer can send a new confirmation.");
}

export async function unverifyPaymentAction(f: FormData) {
  const a = await requirePerm("payments");
  if (a.role !== "owner") return fail(`/admin/orders/${Number(f.get("id"))}`, "Only the owner can undo a payment confirmation.");
  const id = Number(f.get("id"));
  db().prepare("UPDATE orders SET payment_status = 'awaiting_verification', paid_at = NULL, updated_at = datetime('now') WHERE id = ? AND payment_status = 'paid'").run(id);
  logEvent(id, a.email, "payment_unverified", s(f, "note", 300));
  back(`/admin/orders/${id}`, "Payment set back to Awaiting Verification.");
}

export async function setFulfilmentAction(f: FormData) {
  const a = await requirePerm("orders");
  const id = Number(f.get("id"));
  const st = s(f, "status", 20);
  const o = getOrderById(id);
  if (!o || !["unfulfilled", "processing", "shipped", "delivered", "cancelled"].includes(st)) return fail(`/admin/orders/${id}`);
  if (["processing", "shipped", "delivered"].includes(st) && o.payment_status !== "paid") return fail(`/admin/orders/${id}`, "Confirm the order payment before you process or ship this order.");
  if (["processing", "shipped", "delivered"].includes(st) && !["paid", "not_required"].includes(String(o.delivery_payment_status))) return fail(`/admin/orders/${id}`, "Confirm the delivery payment before you process or ship this order.");
  if (st === o.fulfilment_status) return fail(`/admin/orders/${id}`);
  const err = tx((d) => {
    if (o.fulfilment_status === "cancelled" && st !== "cancelled") {
      const e = reserveOrderStock(d, id, a.email, `Order ${o.number} reopened`);
      if (e) return e;
    }
    d.prepare("UPDATE orders SET fulfilment_status = ?, updated_at = datetime('now') WHERE id = ?").run(st, id);
    if (st === "cancelled" && o.fulfilment_status !== "cancelled") {
      releaseOrderStock(d, id, a.email, `Order ${o.number} cancelled`);
      // A cancelled order no longer uses up its coupon. The code and discount stay on the order for the record.
      d.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").run(id);
    }
    if (o.fulfilment_status === "cancelled" && st !== "cancelled" && String(o.coupon_code || "")) {
      // Reopening keeps the discount the customer was given and counts the use again.
      const c = d.prepare("SELECT id FROM coupons WHERE code = ?").get(String(o.coupon_code));
      const key = `phone:${createHash("sha256").update(String(o.phone)).digest("hex")}`;
      if (c) d.prepare("INSERT OR IGNORE INTO coupon_redemptions (coupon_id,order_id,customer_key,discount_amount) VALUES (?,?,?,?)").run(c.id, id, key, Number(o.discount_amount || 0));
    }
    return null;
  });
  if (err) return fail(`/admin/orders/${id}`, `Cannot reopen this order: ${err}`);
  logEvent(id, a.email, "fulfilment_" + st, s(f, "note", 300));
  back(`/admin/orders/${id}`, "Order status updated.");
}

export async function saveDispatchAction(f: FormData) {
  const a = await requirePerm("orders");
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o) return fail("/admin/orders", "Order not found.");
  const courier = s(f, "courier", 80), tracking = s(f, "tracking", 80), note = s(f, "dispatchNote", 300);
  db().prepare(`UPDATE orders SET courier = ?, tracking_reference = ?, dispatch_note = ?,
    dispatched_at = CASE WHEN (? != '' OR ? != '') THEN COALESCE(dispatched_at, datetime('now')) ELSE dispatched_at END, updated_at = datetime('now') WHERE id = ?`)
    .run(courier, tracking, note, courier, tracking, id);
  logEvent(id, a.email, "dispatch_updated", [courier && `Courier: ${courier}`, tracking && `Tracking: ${tracking}`].filter(Boolean).join(" · "));
  back(`/admin/orders/${id}`, "Dispatch details saved.");
}

export async function saveCustomerNoteAction(f: FormData) {
  const a = await requirePerm("customers");
  const phone = s(f, "phone", 20);
  if (!/^\d{8,15}$/.test(phone) || !db().prepare("SELECT 1 FROM orders WHERE phone = ? LIMIT 1").get(phone)) return fail("/admin/customers", "Customer not found.");
  const note = text(f, "note", 4000);
  db().prepare(`INSERT INTO customer_notes (customer_key, note, updated_by, updated_at) VALUES (?,?,?, datetime('now'))
    ON CONFLICT(customer_key) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = datetime('now')`).run(`phone:${phone}`, note, a.email);
  logAdminActivity(a.email, "customer_note_saved", "customer", phone);
  back(`/admin/customers/${phone}`, "Notes saved.");
}

export async function saveNotesAction(f: FormData) {
  const a = await requirePerm("orders");
  const id = Number(f.get("id"));
  db().prepare("UPDATE orders SET admin_notes = ?, updated_at = datetime('now') WHERE id = ?").run(text(f, "notes", 4000), id);
  logEvent(id, a.email, "notes_updated");
  back(`/admin/orders/${id}`, "Notes saved.");
}

/* ---------- products ---------- */
const STATUSES = ["published", "draft", "pending_confirmation", "archived"];


/* ---------- flyer catalog creation ---------- */
export async function createFlyerCatalogAction(f: FormData) {
  const admin = await requirePerm("products");
  if (f.get("confirm") !== "yes") return fail("/admin/products", "Confirm that you want to create the flyer products as drafts.");
  const singles = [
    { name: "Appetite Suppressant (2 Weeks)", prices: [{ label: "2 Weeks", size: "2 Weeks", duration: "2 Weeks", price: 9500 }] },
    { name: "Appetite Suppressant (1 Month)", prices: [{ label: "1 Month", size: "1 Month", duration: "1 Month", price: 18000 }] },
    { name: "Metabolic Reset (2 Weeks)", prices: [{ label: "2 Weeks", size: "2 Weeks", duration: "2 Weeks", price: 10500 }] },
    { name: "Metabolic Reset (1 Month)", prices: [{ label: "1 Month", size: "1 Month", duration: "1 Month", price: 19500 }] },
    { name: "Tummy Tea (2 Weeks)", prices: [{ label: "2 Weeks", size: "2 Weeks", duration: "2 Weeks", price: 13000 }] },
    { name: "Tummy Tea (1 Month)", prices: [{ label: "1 Month", size: "1 Month", duration: "1 Month", price: 25000 }] },
    { name: "Flat Tummy Seed", prices: [{ label: "Single Pack", size: "Single Pack", duration: "", price: 4000 }] },
    { name: "Trim Down Coffee", prices: [{ label: "Single Pack", size: "Single Pack", duration: "", price: 10000 }] },
    { name: "Get Snatched Oil", prices: [{ label: "Single Bottle", size: "Single Bottle", duration: "", price: 15000 }] },
  ];
  const combos = [
    { name: "General Fat Loss (2 Weeks)", price: 35500, items: ["Appetite Suppressant", "Metabolic Reset", "Tummy Balance", "Flat Tummy Seed"], sizeNote: "2 Weeks" },
    { name: "General Fat Loss (1 Month)", price: 64500, items: ["Appetite Suppressant", "Metabolic Reset", "Tummy Tea", "Flat Tummy Seed"], sizeNote: "1 Month" },
    { name: "Basic Tummy Blast", price: 26000, items: ["Tummy Balance (Big)", "Flat Tummy Seed"], sizeNote: "" },
    { name: "Mega Tummy Blast", price: 40000, items: ["Tummy Balance (Big)", "Flat Tummy Seed", "Get Snatched Oil"], sizeNote: "" },
    { name: "Body Reset Combo", price: 31000, items: ["Metabolic Reset", "Trim Down Coffee", "Tummy Balance (S)"], sizeNote: "" },
    { name: "1 Month Full Kit", price: 87000, items: ["Metabolic Reset", "Appetite Suppressant", "Tummy Balance", "Trim Down Coffee", "Get Snatched Oil", "Flat Tummy Seed"], sizeNote: "1 Month" },
  ];
  let created = 0, skipped = 0;
  const createdIds = new Map<string, number>();
  tx((d) => {
    // Archive legacy duration-variant listings so the split listings do not appear alongside them.
    ["Appetite Suppressant", "Metabolic Reset", "Tummy Tea"].forEach((legacyName) => {
      d.prepare("UPDATE products SET status='archived' WHERE lower(name)=lower(?) AND type='single'").run(legacyName);
    });
    const syncSingleProduct = (item: typeof singles[number]) => {
      const product = d.prepare("SELECT id FROM products WHERE lower(name)=lower(?) AND type='single' AND status!='archived'").get(item.name);
      let productId: number;
      if (product) {
        productId = Number(product.id);
        d.prepare("UPDATE products SET category='individual', short_description=?, updated_at=datetime('now') WHERE id=?").run("WellnessXpress individual product.", productId);
      } else {
        let slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product";
        while (d.prepare("SELECT 1 FROM products WHERE slug=?").get(slug)) slug += "-2";
        productId = Number(d.prepare("INSERT INTO products (slug,name,type,category,short_description,description,status,featured,sort,review_note) VALUES (?,?,?,?,?,?, 'draft',0,999,?)").run(
          slug, item.name, "single", "individual", "WellnessXpress individual product.", "", "Created from approved flyer. Add product image and verify details before publishing."
        ).lastInsertRowid);
      }
      const v = item.prices[0];
      const oldVariants = d.prepare("SELECT id,sku FROM variants WHERE product_id=? ORDER BY sort,id").all(productId);
      const target = oldVariants[0];
      if (target) {
        d.prepare("UPDATE variants SET label=?,size=?,duration=?,price=?,sale_price=NULL,stock=NULL,status='active',needs_confirmation=0,sort=0 WHERE id=? AND product_id=?").run(v.label,v.size,v.duration,v.price,target.id,productId);
        if (oldVariants.length > 1) d.prepare("UPDATE variants SET status='inactive' WHERE product_id=? AND id!=?").run(productId,target.id);
      } else {
        d.prepare("INSERT INTO variants (product_id,label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,price_source,sort) VALUES (?,?,?,?,?,?,NULL,NULL,'active',0,?,?)").run(productId,v.label,v.size,v.duration,`WX-FLYER-${productId}-1`,v.price,"November 20, 2026 flyer",0);
      }
      createdIds.set(item.name, productId);
    };
    singles.forEach(syncSingleProduct);
    const createProduct = (name: string, type: "single" | "combo", variants: {label:string;size:string;duration:string;price:number}[], items: string[] = [], sizeNote = "") => {
      const exists = d.prepare("SELECT id FROM products WHERE lower(name)=lower(?) AND type=? AND status!='archived'").get(name, type);
      if (exists) { skipped++; createdIds.set(name, Number(exists.id)); return; }
      let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product";
      while (d.prepare("SELECT 1 FROM products WHERE slug=?").get(slug)) slug += "-2";
      const productId = Number(d.prepare("INSERT INTO products (slug,name,type,category,short_description,description,status,featured,sort,review_note) VALUES (?,?,?,?,?,?, 'draft',0,999,?)").run(
        slug, name, type, type === "combo" ? "combos" : "individual", type === "combo" ? "WellnessXpress combo set." : "WellnessXpress individual product.", "", "Created from the approved November 20, 2026 flyer. Add product image and verify product details before publishing."
      ).lastInsertRowid);
      variants.forEach((v, i) => {
        const sku = `WX-FLYER-${productId}-${i+1}`;
        d.prepare("INSERT INTO variants (product_id,label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,price_source,sort) VALUES (?,?,?,?,?,?,NULL,NULL,'active',0,?,?)").run(
          productId, v.label, v.size, v.duration, sku, v.price, "November 20, 2026 flyer", i
        );
      });
      if (type === "combo") {
        items.forEach((item, i) => {
          const linked = d.prepare("SELECT id FROM products WHERE lower(name)=lower(?) AND type='single'").get(item);
          d.prepare("INSERT INTO combo_items (combo_id,item_product_id,item_name,size_note,quantity_note,sort) VALUES (?,?,?,?,?,?)").run(
            productId, linked ? Number(linked.id) : null, item, sizeNote, "", i
          );
        });
      }
      created++;
      createdIds.set(name, productId);
    };
    singles.forEach((item) => createProduct(item.name, "single", item.prices));
    combos.forEach((item) => createProduct(item.name, "combo", [{label: item.sizeNote || "Combo Set", size: item.sizeNote, duration: item.sizeNote, price: item.price}], item.items, item.sizeNote));
  });
  logAdminActivity(admin.email, "create_flyer_catalog", "product", "", `Created ${created}, skipped existing ${skipped}`);
  revalidatePath("/", "layout");
  back("/admin/products", `Flyer catalog processed. ${created} created as drafts, ${skipped} existing products skipped. Add photos to drafts before publishing.`);
}

export async function createProductAction(f: FormData) {
  const a = await requirePerm("products");
  const name = s(f, "name", 120);
  const type = f.get("type") === "combo" ? "combo" : "single";
  if (name.length < 2) return fail("/admin/products", "Enter a product name.", "name");
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product";
  while (db().prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) slug += "-2";
  const r = db().prepare("INSERT INTO products (slug,name,type,category,status,sort) VALUES (?,?,?,?, 'draft', 999)").run(slug, name, type, type === "combo" ? "combos" : "individual");
  logAdminActivity(a.email, "create_product", "product", String(r.lastInsertRowid), name);
  redirect(`/admin/products/${r.lastInsertRowid}?msg=${encodeURIComponent("Product created as a draft. Add a price option and a photo, then publish it.")}`);
}

/** Clone catalog configuration only. Orders, customers, and sales history are never copied. */
export async function duplicateProductAction(f: FormData) {
  const a = await requirePerm("products");
  const id = Number(f.get("id"));
  const source = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!source) return fail("/admin/products", "Product not found.");
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
  logAdminActivity(a.email, "duplicate_product", "product", String(newId), `Copied from product ${id} as draft`);
  redirect(`/admin/products/${newId}?msg=${encodeURIComponent("Draft copy created. Review its options and contents before publishing.")}`);
}

export async function bulkProductsAction(f: FormData) {
  const a = await requirePerm("products");
  const ids = f.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  const op = s(f, "op", 20);
  if (!ids.length) return fail("/admin/products", "Tick at least one product.");
  const ph = ids.map(() => "?").join(",");
  if (op === "publish") {
    const ok = db().prepare(`SELECT p.id FROM products p WHERE p.id IN (${ph}) AND EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.status = 'active')`).all(...ids).map((r) => Number(r.id));
    if (ok.length) db().prepare(`UPDATE products SET status='published', updated_at=datetime('now') WHERE id IN (${ok.map(() => "?").join(",")})`).run(...ok);
    audit(a, "bulkProductsAction", f, `${ok.length} of ${ids.length} published`);
    revalidatePath("/", "layout");
    return back("/admin/products", `${ok.length} published.${ok.length < ids.length ? ` ${ids.length - ok.length} skipped because they have no active price option.` : ""}`);
  }
  const sql: Record<string, string> = {
    draft: "status='draft'", archive: "status='archived'", feature: "featured=1", unfeature: "featured=0",
  };
  if (!sql[op]) return fail("/admin/products", "Choose a bulk action.");
  db().prepare(`UPDATE products SET ${sql[op]}, updated_at=datetime('now') WHERE id IN (${ph})`).run(...ids);
  revalidatePath("/", "layout");
  audit(a, "bulkProductsAction", f, `${ids.length} records: ${op}`);
  back("/admin/products", `${ids.length} product${ids.length === 1 ? "" : "s"} updated.`);
}

/** Permanent delete is only allowed for archived products that never appeared in an order or a combo. */
export async function deleteProductAction(f: FormData) {
  const a = await requirePerm("products");
  const id = Number(f.get("id"));
  const p = db().prepare("SELECT status, name FROM products WHERE id = ?").get(id);
  if (!p) return fail("/admin/products", "Product not found.");
  if (p.status !== "archived") return fail(`/admin/products/${id}`, "Archive the product first. Only archived products can be deleted.");
  if (db().prepare("SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1").get(id)) return fail(`/admin/products/${id}`, "This product is in past orders, so it is kept for your records. It stays archived and hidden.");
  if (db().prepare("SELECT 1 FROM combo_items WHERE item_product_id = ? LIMIT 1").get(id)) return fail(`/admin/products/${id}`, "A combo set still includes this product. Remove it from the combo first.");
  if (f.get("confirm") !== String(p.name)) return fail(`/admin/products/${id}`, "Type the product name exactly to confirm deletion.");
  tx((d) => {
    d.prepare("DELETE FROM combo_items WHERE combo_id = ?").run(id);
    d.prepare("DELETE FROM variants WHERE product_id = ?").run(id);
    d.prepare("DELETE FROM products WHERE id = ?").run(id);
  });
  revalidatePath("/", "layout");
  audit(a, "deleteProductAction", f, "");
  redirect(`/admin/products?msg=${encodeURIComponent(`${String(p.name)} deleted. Its images stay in the media library.`)}`);
}

export async function archiveProductAction(f: FormData) {
  const a = await requirePerm("products");
  const id = Number(f.get("id"));
  const exists = db().prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!exists) return fail("/admin/products", "Product not found.");
  db().prepare("UPDATE products SET status='archived', updated_at=datetime('now') WHERE id=?").run(id);
  revalidatePath("/", "layout");
  audit(a, "archiveProductAction", f, "");
  back("/admin/products", "Product archived. Historical order records were retained.");
}

export async function createCategoryAction(f: FormData) {
  const a = await requirePerm("categories");
  const name = s(f, "name", 80);
  if (name.length < 2) return fail("/admin/categories", "Enter a category name.", "name");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  if (!slug) return fail("/admin/categories", "Use a category name containing letters or numbers.", "name");
  if (db().prepare("SELECT 1 FROM categories WHERE slug = ?").get(slug)) return fail("/admin/categories", "A category already uses that web address.", "name");
  db().prepare("INSERT INTO categories (slug,name,description,image,sort,status) VALUES (?,?,?,'',?,'hidden')")
    .run(slug, name, text(f, "description", 1000), Number(f.get("sort")) || 0);
  audit(a, "createCategoryAction", f, "");
  back("/admin/categories", "Category created hidden. Review its details and publish it when ready.");
}

export async function saveCategoryAction(f: FormData) {
  const a = await requirePerm("categories");
  const id = Number(f.get("id"));
  const current = db().prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!current) return fail("/admin/categories", "Category not found.");
  const slug = s(f, "slug", 70).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
  const duplicate = db().prepare("SELECT 1 FROM categories WHERE slug = ? AND id != ?").get(slug, id);
  const used = Number(db().prepare("SELECT COUNT(*) n FROM products WHERE category = ?").get(current.slug)?.n || 0);
  if (!slug || duplicate) return fail("/admin/categories", "That slug is empty or already used.", "slug");
  if (used && slug !== current.slug) return fail("/admin/categories", "This category is assigned to products. Keep its slug to preserve existing category URLs.");
  if (slug !== current.slug) {
    db().prepare("UPDATE category_redirects SET new_slug = ? WHERE new_slug = ?").run(slug, current.slug);
    db().prepare("INSERT INTO category_redirects (old_slug,new_slug) VALUES (?,?) ON CONFLICT(old_slug) DO UPDATE SET new_slug=excluded.new_slug").run(current.slug, slug);
  }
  const status = f.get("status") === "published" ? "published" : "hidden";
  const image = s(f, "image", 300);
  if (image && !image.startsWith("/images/") && !/^\/media\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image))
    return fail("/admin/categories", "Choose a project image path or an uploaded media URL.");
  db().prepare(`UPDATE categories SET slug=?,name=?,description=?,image=?,seo_title=?,meta_description=?,status=?,sort=?,updated_at=datetime('now') WHERE id=?`)
    .run(slug, s(f, "name", 80), text(f, "description", 1000), image, s(f, "seoTitle", 120), text(f, "metaDescription", 300), status, Number(f.get("sort")) || 0, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${slug}`);
  audit(a, "saveCategoryAction", f, "");
  back("/admin/categories", "Category saved.");
}

export async function uploadCategoryImageAction(f: FormData) {
  const a = await requirePerm("categories");
  const id = Number(f.get("id"));
  const category = db().prepare("SELECT slug FROM categories WHERE id = ?").get(id);
  if (!category) return fail("/admin/categories", "Category not found.");
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return fail("/admin/categories", "Choose an image to upload.");
  const r = await saveImageUpload(file, a.email);
  if (r.error) return fail("/admin/categories", r.error);
  db().prepare("UPDATE categories SET image=?,updated_at=datetime('now') WHERE id=?").run(r.media!.url, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(category.slug)}`);
  audit(a, "uploadCategoryImageAction", f, "");
  back("/admin/categories", "Category image uploaded to the media library and saved.");
}

export async function saveProductAction(f: FormData) {
  const a = await requirePerm("products");
  const id = Number(f.get("id"));
  const p = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!p) return fail("/admin/products");
  const slug = s(f, "slug", 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!slug || db().prepare("SELECT 1 FROM products WHERE slug = ? AND id != ?").get(slug, id)) return fail(`/admin/products/${id}`, "That web address (slug) is empty or already used.", "slug");
  const category = s(f, "category", 70);
  if (!db().prepare("SELECT 1 FROM categories WHERE slug = ?").get(category)) return fail(`/admin/products/${id}`, "Choose an existing category.", "category");
  const status = STATUSES.includes(s(f, "status", 30)) ? s(f, "status", 30) : "draft";
  if (status === "published" && !db().prepare("SELECT 1 FROM variants WHERE product_id = ? AND status = 'active'").get(id))
    return fail(`/admin/products/${id}`, "Add at least one active price option before you publish.", "status");
  const faqs = text(f, "faqs", 6000).split(/\n{2,}/).map((b) => b.split("\n")).filter((b) => b[0]?.startsWith("Q:")).map((b) => ({ q: b[0].slice(2).trim(), a: b.slice(1).join(" ").replace(/^A:\s*/, "").trim() })).filter((x) => x.q && x.a);
  const related = s(f, "related", 500).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  db().prepare(
    `UPDATE products SET name=?, slug=?, category=?, short_description=?, description=?, information=?, ingredients=?, directions=?, faqs=?, related=?,
     status=?, featured=?, sort=?, review_note=?, updated_at=datetime('now') WHERE id=?`
  ).run(s(f, "name", 120), slug, category, s(f, "short", 300), text(f, "description"), text(f, "information"),
    text(f, "ingredients", 2000), text(f, "directions", 4000), JSON.stringify(faqs), JSON.stringify(related), status, f.get("featured") ? 1 : 0,
    Number(f.get("sort")) || 0, text(f, "review", 2000), id);
  if (slug !== String(p.slug)) {
    // Keep old product links working: /product/<old> answers with a permanent redirect to the new address.
    db().prepare("UPDATE product_redirects SET new_slug = ? WHERE new_slug = ?").run(slug, String(p.slug));
    db().prepare("DELETE FROM product_redirects WHERE old_slug = ?").run(slug);
    db().prepare("INSERT INTO product_redirects (old_slug, new_slug) VALUES (?, ?) ON CONFLICT(old_slug) DO UPDATE SET new_slug = excluded.new_slug").run(String(p.slug), slug);
  }
  revalidatePath("/", "layout");
  audit(a, "saveProductAction", f, slug !== String(p.slug) ? `address changed ${String(p.slug)} → ${slug}` : "");
  back(`/admin/products/${id}`, "Product saved.");
}

export async function saveVariantAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const vid = Number(f.get("variantId")) || 0;
  const label = s(f, "label", 60);
  const price = money(f.get("price"));
  const saleRaw = String(f.get("salePrice") ?? "").trim();
  const sale = saleRaw ? money(saleRaw) : null;
  const stockRaw = String(f.get("stock") ?? "").trim();
  const stock = stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw)) || 0);
  if (!label || price == null || price < 1) return fail(`/admin/products/${pid}`, "Each price option needs a name and a price.", "price");
  if (sale != null && sale >= price) return fail(`/admin/products/${pid}`, "The sale price must be lower than the price.", "salePrice");
  const status = ["active", "inactive"].includes(s(f, "status", 20)) ? s(f, "status", 20) : "active";
  let sku = s(f, "sku", 60).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!sku) sku = `WX-${pid}-${label.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  if (db().prepare("SELECT 1 FROM variants WHERE sku = ? AND id != ?").get(sku, vid)) return fail(`/admin/products/${pid}`, `SKU ${sku} is already used.`, "sku");
  const vals = [label, s(f, "size", 60), s(f, "duration", 60), sku, price, sale, stock, status, f.get("confirmed") ? 0 : 1, Number(f.get("sort")) || 0];
  const admin = await requirePerm("products");
  tx((d) => {
    const before = vid ? d.prepare("SELECT stock FROM variants WHERE id = ? AND product_id = ?").get(vid, pid) : undefined;
    const prev = before?.stock == null ? null : Number(before.stock);
    let id = vid;
    if (vid) d.prepare("UPDATE variants SET label=?, size=?, duration=?, sku=?, price=?, sale_price=?, stock=?, status=?, needs_confirmation=?, sort=? WHERE id=? AND product_id=?").run(...vals, vid, pid);
    else id = Number(d.prepare("INSERT INTO variants (label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,sort,product_id,price_source) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'Added in admin')").run(...vals, pid).lastInsertRowid);
    // Every stock change is recorded in the inventory history.
    if (stock !== prev) recordMovement(d, id, (stock ?? 0) - (prev ?? 0), prev == null ? "opening" : "correction", stock == null ? "Stock tracking switched off in product editor" : "Set in product editor", admin.email);
  });
  db().prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").run(pid);
  revalidatePath("/", "layout");
  audit(a, "saveVariantAction", f, "");
  back(`/admin/products/${pid}`, "Price option saved.");
}

export async function deleteVariantAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const vid = Number(f.get("variantId"));
  const used = db().prepare("SELECT 1 FROM order_items WHERE variant_id = ?").get(vid);
  if (used) db().prepare("UPDATE variants SET status = 'inactive' WHERE id = ?").run(vid);
  else db().prepare("DELETE FROM variants WHERE id = ? AND product_id = ?").run(vid, pid);
  audit(a, "deleteVariantAction", f, "");
  back(`/admin/products/${pid}`, used ? "This option has past orders, so it was switched off instead of deleted." : "Price option deleted.");
}

export async function saveComboItemsAction(f: FormData) {
  const a = await requirePerm("products");
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
  audit(a, "saveComboItemsAction", f, "");
  back(`/admin/products/${pid}`, "Set contents saved.");
}

export async function uploadImageAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const files = f.getAll("image").filter((x): x is File => typeof x !== "string" && x.size > 0).slice(0, 10);
  if (!files.length) return fail(`/admin/products/${pid}`, "Choose an image to upload.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  if (!p) return fail("/admin/products", "Product not found.");
  const imgs = JSON.parse(String(p.images || "[]")) as string[];
  const errors: string[] = [];
  for (const file of files) {
    const r = await saveImageUpload(file, a.email);
    if (r.error) errors.push(r.error); else imgs.push(r.media!.url);
  }
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "uploadImageAction", f, "");
  back(`/admin/products/${pid}`, errors.length ? `Some files were not added: ${errors.join(" ")}` : `${files.length} image${files.length === 1 ? "" : "s"} uploaded to the media library and added.`);
}

export async function replaceImageAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return fail(`/admin/products/${pid}`, "Choose the new image.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return fail(`/admin/products/${pid}`);
  const r = await saveImageUpload(file, a.email);
  if (r.error) return fail(`/admin/products/${pid}`, r.error);
  const old = imgs[idx];
  imgs[idx] = r.media!.url;
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "replaceImageAction", f, "");
  back(`/admin/products/${pid}`, `Image replaced. The old image (${old.split("/").pop()}) stays in the media library.`);
}

export async function addFromLibraryAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const m = getMedia(Number(f.get("mediaId")));
  if (!m) return fail(`/admin/products/${pid}`, "Choose an image from the library.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (imgs.includes(m.url)) return fail(`/admin/products/${pid}`, "That image is already in this product's gallery.");
  imgs.push(m.url);
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "addFromLibraryAction", f, "");
  back(`/admin/products/${pid}`, "Image added from the media library.");
}

export async function libraryUploadAction(f: FormData) {
  const a = await requirePerm("media");
  const files = f.getAll("images").filter((x): x is File => typeof x !== "string" && x.size > 0).slice(0, 20);
  if (!files.length) return fail("/admin/media", "Choose at least one image.");
  const errors: string[] = [];
  let ok = 0;
  for (const file of files) { const r = await saveImageUpload(file, a.email); if (r.error) errors.push(r.error); else ok++; }
  audit(a, "libraryUploadAction", f, "");
  back("/admin/media", `${ok} uploaded.${errors.length ? " Not uploaded: " + errors.join(" ") : ""}`);
}

export async function saveMediaMetaAction(f: FormData) {
  const a = await requirePerm("media", "products");
  const id = Number(f.get("id"));
  const ret = s(f, "back", 200).startsWith("/admin/") ? s(f, "back", 200) : "/admin/media";
  db().prepare("UPDATE media SET alt = ?, caption = ? WHERE id = ?").run(s(f, "alt", 150), s(f, "caption", 200), id);
  revalidatePath("/", "layout");
  audit(a, "saveMediaMetaAction", f, "");
  back(ret, "Image text saved.");
}

export async function deleteMediaAction(f: FormData) {
  const a = await requirePerm("media");
  const err = await deleteMedia(Number(f.get("id")));
  if (!err) audit(a, "deleteMediaAction", f, "");
  back("/admin/media", err || "Image deleted.");
}

export async function imageOrderAction(f: FormData) {
  const a = await requirePerm("products");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const op = s(f, "op", 10);
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return fail(`/admin/products/${pid}`);
  if (op === "remove") imgs.splice(idx, 1);
  if (op === "first") imgs.unshift(...imgs.splice(idx, 1));
  if (op === "up" && idx > 0) [imgs[idx - 1], imgs[idx]] = [imgs[idx], imgs[idx - 1]];
  if (op === "down" && idx < imgs.length - 1) [imgs[idx + 1], imgs[idx]] = [imgs[idx], imgs[idx + 1]];
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "imageOrderAction", f, "");
  back(`/admin/products/${pid}`, op === "remove" ? "Image removed from this product." : "Main image updated.");
}

/* ---------- inventory ---------- */
export async function adjustStockAction(f: FormData) {
  const a = await requirePerm("inventory");
  const vid = Number(f.get("variantId"));
  const kind = s(f, "kind", 20) as AdjustKind;
  const back2 = s(f, "back", 200).startsWith("/admin/") ? s(f, "back", 200) : "/admin/inventory";
  if (!["opening", "increase", "decrease", "correction", "untrack"].includes(kind)) return fail(back2, "Choose a stock action.");
  const qty = kind === "untrack" ? 0 : Number(String(f.get("qty") ?? "").trim());
  const err = adjustStock(vid, kind, qty, s(f, "note", 300), a.email);
  revalidatePath("/", "layout");
  if (!err) audit(a, "adjustStockAction", f, `${kind} ${qty}${s(f, "note", 300) ? ` · ${s(f, "note", 300)}` : ""}`);
  back(back2, err || "Stock updated and recorded in the history.");
}
export async function setThresholdAction(f: FormData) {
  const a = await requirePerm("inventory");
  const vid = Number(f.get("variantId"));
  const raw = String(f.get("threshold") ?? "").trim();
  const t = raw === "" ? null : Math.floor(Number(raw));
  if (t != null && (!Number.isFinite(t) || t < 0 || t > 100000)) return fail("/admin/inventory", "Enter a whole number for the low-stock level, or leave it empty.", "threshold");
  db().prepare("UPDATE variants SET low_stock_threshold = ? WHERE id = ?").run(t, vid);
  audit(a, "setThresholdAction", f, `low-stock level ${t ?? "none"}`);
  back("/admin/inventory", "Low-stock level saved.");
}

/* ---------- delivery ---------- */
type ZoneInput = { state: string; fee: number | null; active: boolean; eta: string; note: string; internalNote: string };
function writeZones(rows: ZoneInput[]) {
  tx((d) => {
    for (const z of rows) {
      d.prepare(`INSERT INTO delivery_zones (state, fee, active, eta, note, internal_note, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(state) DO UPDATE SET fee=excluded.fee, active=excluded.active, eta=excluded.eta, note=excluded.note, internal_note=excluded.internal_note, updated_at=datetime('now')`)
        .run(z.state, z.fee, z.active ? 1 : 0, z.eta, z.note, z.internalNote);
    }
  });
}

export async function saveDeliveryAction(f: FormData) {
  const a = await requirePerm("delivery");
  // Fees come from the approved rate list, not this form. Keep whatever fee is stored; never turn a blank into ₦0.
  const stored = new Map(deliveryZones().map((z) => [z.state, z.fee]));
  const rows: ZoneInput[] = NIGERIAN_STATES.map((st) => ({
    state: st, fee: stored.get(st) ?? null, active: !!f.get(`active_${st}`), eta: s(f, `eta_${st}`, 80), note: s(f, `note_${st}`, 160), internalNote: s(f, `internal_${st}`, 300),
  }));
  writeZones(rows);
  revalidatePath("/checkout");
  const off = rows.filter((r) => !r.active).map((r) => r.state);
  audit(a, "saveDeliveryAction", f, `${37 - off.length} of 37 covered`);
  back("/admin/delivery", off.length ? `Saved. Delivery is switched off for: ${off.join(", ")}.` : "Delivery settings saved.");
}

export async function bulkDeliveryAction(f: FormData) {
  const a = await requirePerm("delivery");
  const states = f.getAll("states").map(String).filter((x) => NIGERIAN_STATES.includes(x));
  if (!states.length) return fail("/admin/delivery", "Tick at least one state for the bulk update.");
  const op = s(f, "op", 20);
  if (!["eta", "enable", "disable", "note"].includes(op)) return fail("/admin/delivery", "Choose a bulk action.");
  const current = new Map(db().prepare("SELECT * FROM delivery_zones").all().map((r) => [String(r.state), r]));
  const rows: ZoneInput[] = states.map((st) => {
    const c = current.get(st);
    const base: ZoneInput = { state: st, fee: c?.fee == null ? null : Number(c.fee), active: c ? Number(c.active) === 1 : true, eta: String(c?.eta || ""), note: String(c?.note || ""), internalNote: String(c?.internal_note || "") };
    if (op === "eta") return { ...base, eta: s(f, "bulkEta", 80) };
    if (op === "note") return { ...base, note: s(f, "bulkEta", 160) };
    if (op === "enable") return { ...base, active: true };
    return { ...base, active: false };
  });
  writeZones(rows);
  revalidatePath("/checkout");
  audit(a, "bulkDeliveryAction", f, `${op} · ${rows.length} state(s)`);
  back("/admin/delivery", `Updated ${rows.length} state(s).`);
}

/** Parses a delivery CSV with a header row (State, Enabled, ETA, Note, Internal note). Older exports with a Fee column are accepted; the fee is ignored. */
function parseDeliveryCsv(text: string) {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
  const rows: ZoneInput[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (q) { if (ch === '"' && l[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur); return out.map((x) => x.trim());
  };
  const head = split(lines[0] || "").map((h) => h.toLowerCase());
  if (head[0] !== "state") return { rows, problems: ["The first line must be the header: State, Enabled, ETA, Note, Internal note. Export a template first."] };
  const col = (name: string) => head.indexOf(name);
  const iEn = col("enabled"), iFee = col("fee"), iEta = col("eta"), iNote = col("note"), iInt = col("internal note");
  lines.slice(1).forEach((l, i) => {
    const n = i + 2;
    const c = split(l);
    const st = NIGERIAN_STATES.find((x) => x.toLowerCase() === (c[0] || "").toLowerCase() || (/^fct|abuja/i.test(c[0] || "") && x.startsWith("FCT")));
    if (!st) { problems.push(`Line ${n}: "${(c[0] || "").slice(0, 40)}" is not a Nigerian state.`); return; }
    if (seen.has(st)) { problems.push(`Line ${n}: ${st} appears more than once.`); return; }
    seen.add(st);
    const en = iEn >= 0 ? (c[iEn] || "").toLowerCase() : "yes";
    if (en && !["yes", "no", "true", "false", "1", "0", "y", "n"].includes(en)) { problems.push(`Line ${n}: Enabled must be yes or no.`); return; }
    rows.push({ state: st, fee: iFee >= 0 && c[iFee] ? money(c[iFee]) : null, active: en === "" || ["yes", "true", "1", "y"].includes(en), eta: iEta >= 0 ? clean(c[iEta] || "", 80) : "", note: iNote >= 0 ? clean(c[iNote] || "", 160) : "", internalNote: iInt >= 0 ? clean(c[iInt] || "", 300) : "" });
  });
  return { rows, problems };
}

export async function previewDeliveryImportAction(_: unknown, f: FormData) {
  await requirePerm("delivery");
  const file = f.get("file");
  let text = "";
  if (file && typeof file !== "string" && file.size) {
    if (file.size > 200_000) return { error: "The file is too large. Use the exported CSV as a template." };
    text = await file.text();
  } else text = String(f.get("csv") || "");
  if (!text.trim()) return { error: "Choose a CSV file to import." };
  const { rows, problems } = parseDeliveryCsv(text);
  return { rows, problems, csv: text.slice(0, 200_000) };
}

export async function applyDeliveryImportAction(f: FormData) {
  const a = await requirePerm("delivery");
  const { rows, problems } = parseDeliveryCsv(String(f.get("csv") || ""));
  if (problems.length) return fail("/admin/delivery", "Import cancelled. The file has problems; preview it again and fix them first.");
  if (!rows.length) return fail("/admin/delivery", "Nothing to import.");
  const existingFees = new Map(db().prepare("SELECT state, fee FROM delivery_zones").all().map((r) => [String(r.state), r.fee == null ? null : Number(r.fee)]));
  const feeRows = rows.map((r) => ({ ...r, fee: r.fee ?? existingFees.get(r.state) ?? null }));
  writeZones(feeRows);
  revalidatePath("/checkout");
  audit(a, "applyDeliveryImportAction", f, "");
  back("/admin/delivery", `Imported ${rows.length} state(s). States not in the file were not changed.`);
}

/* ---------- settings ---------- */
export async function saveBankAction(f: FormData) {
  const a = await requirePerm("settings");
  const bank = s(f, "bank", 80);
  const accountName = s(f, "accountName", 120);
  const accountNumber = s(f, "accountNumber", 20).replace(/\D/g, "");
  if (!bank || !accountName || !/^\d{10}$/.test(accountNumber)) return fail("/admin/settings", "Enter the bank name, account name and a 10-digit account number.");
  setSetting("bank", { bank, accountName, accountNumber });
  console.info(`[admin] bank details updated by ${a.email}`);
  audit(a, "saveBankAction", f, "");
  back("/admin/settings", "Bank details saved. New orders show these details.");
}
export async function saveContactAction(f: FormData) {
  const a = await requirePerm("settings");
  const whatsapp = normalisePhone(s(f, "whatsapp", 30));
  const email = s(f, "email", 254).toLowerCase();
  if (!whatsapp) return fail("/admin/settings", "Enter a valid Nigerian WhatsApp number.");
  if (email && !isEmail(email)) return fail("/admin/settings", "Enter a valid email address.");
  const url = (k: string) => { const v = s(f, k, 200); return /^https:\/\/[^\s]+$/.test(v) ? v : ""; };
  setSetting("contact", { whatsapp, email, instagram: url("instagram"), facebook: url("facebook"), tiktok: url("tiktok") });
  revalidatePath("/", "layout");
  audit(a, "saveContactAction", f, "");
  back("/admin/settings", "Contact details saved.");
}
export async function saveContentAction(f: FormData) {
  const a = await requirePerm("settings");
  for (const k of ["announcement", "about", "productNotice", "shippingPolicy", "returnsPolicy", "privacyPolicy", "termsPolicy"]) {
    if (f.has(k)) setSetting(k, text(f, k, k === "announcement" ? 200 : 8000));
  }
  revalidatePath("/", "layout");
  audit(a, "saveContentAction", f, "");
  back("/admin/settings", "Content saved.");
}

/* ---------- users ---------- */
/** Non-owners with Staff management can manage staff accounts only, and can grant only permissions they hold themselves. */
function staffGuard(a: { role: string; perms: string[] }, targetId: number | null, wantRole: string, wantPerms: string[]) {
  if (a.role === "owner") return null;
  if (wantRole === "owner") return "Only an owner can create or change owner accounts.";
  if (targetId != null) {
    const t = db().prepare("SELECT role FROM users WHERE id = ?").get(targetId);
    if (!t) return "User not found.";
    if (t.role === "owner") return "Only an owner can change an owner account.";
  }
  const extra = wantPerms.filter((p) => !a.perms.includes(p));
  if (extra.length) return `You cannot grant permissions you do not have: ${extra.join(", ")}.`;
  return null;
}
const permsFrom = (f: FormData) => [...new Set(f.getAll("perms").map(String).filter(isPermission))];

export async function addUserAction(f: FormData) {
  const a = await requirePerm("staff");
  const email = s(f, "email", 254).toLowerCase();
  const name = s(f, "name", 80);
  const pw = String(f.get("password") || "");
  const role = f.get("role") === "owner" ? "owner" : "staff";
  const perms = permsFrom(f);
  if (!isEmail(email) || name.length < 2) return fail("/admin/users", "Enter a name and a valid email.", "email");
  if (pw.length < 10) return fail("/admin/users", "The password must be at least 10 characters.", "password");
  if (db().prepare("SELECT 1 FROM users WHERE email = ?").get(email) || email === (process.env.ADMIN_EMAIL || "").trim().toLowerCase()) return fail("/admin/users", "A user with that email already exists.", "email");
  const err = staffGuard(a, null, role, perms);
  if (err) return fail("/admin/users", err);
  db().prepare("INSERT INTO users (email,name,role,password_hash,permissions) VALUES (?,?,?,?,?)").run(email, name, role, hashPassword(pw), JSON.stringify(perms));
  logAdminActivity(a.email, "add_user", "user", email, role === "owner" ? "owner (all permissions)" : `staff: ${perms.join(", ") || "no permissions"}`);
  back("/admin/users", "User added.");
}
export async function setUserPermissionsAction(f: FormData) {
  const a = await requirePerm("staff");
  const id = Number(f.get("id"));
  const role = f.get("role") === "owner" ? "owner" : "staff";
  const perms = permsFrom(f);
  const u = db().prepare("SELECT email, role, permissions FROM users WHERE id = ?").get(id);
  if (!u) return fail("/admin/users", "User not found.");
  if (String(a.uid) === String(id)) return fail("/admin/users", "You cannot change your own permissions.");
  const err = staffGuard(a, id, role, perms);
  if (err) return fail("/admin/users", err);
  db().prepare("UPDATE users SET role = ?, permissions = ? WHERE id = ?").run(role, JSON.stringify(perms), id);
  logAdminActivity(a.email, "set_permissions", "user", String(u.email), `${String(u.role)} → ${role}; ${role === "owner" ? "all permissions" : perms.join(", ") || "no permissions"}`);
  back("/admin/users", `Permissions saved for ${String(u.email)}.`);
}
export async function toggleUserAction(f: FormData) {
  const a = await requirePerm("staff");
  const id = Number(f.get("id"));
  const u = db().prepare("SELECT email, active FROM users WHERE id = ?").get(id);
  if (!u) return fail("/admin/users", "User not found.");
  if (String(a.uid) === String(id)) return fail("/admin/users", "You cannot disable your own account.");
  const err = staffGuard(a, id, "staff", []);
  if (err) return fail("/admin/users", err);
  db().prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(id);
  logAdminActivity(a.email, Number(u.active) ? "disable_user" : "enable_user", "user", String(u.email));
  back("/admin/users", "User updated.");
}
export async function resetUserPasswordAction(f: FormData) {
  const a = await requirePerm("staff");
  const id = Number(f.get("id"));
  const pw = String(f.get("password") || "");
  if (pw.length < 10) return fail("/admin/users", "The password must be at least 10 characters.", "password");
  const u = db().prepare("SELECT email FROM users WHERE id = ?").get(id);
  if (!u) return fail("/admin/users", "User not found.");
  const err = staffGuard(a, id, "staff", []);
  if (err) return fail("/admin/users", err);
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), id);
  logAdminActivity(a.email, "reset_password", "user", String(u.email));
  back("/admin/users", "Password changed.");
}

/* ---------- notifications, reviews, testimonials, coupons (ported from the Codex checkpoint) ---------- */
export async function markNotificationReadAction(f: FormData) {
  await requirePerm("notifications");
  const id = Number(f.get("id"));
  if (f.get("all") === "yes") db().prepare("UPDATE admin_notifications SET read_at=COALESCE(read_at,datetime('now'))").run();
  else if (Number.isSafeInteger(id) && id > 0) db().prepare("UPDATE admin_notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE id=?").run(id);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  back("/admin/notifications", "Notification status updated.");
}

export async function moderateReviewAction(f: FormData) {
  const a = await requirePerm("reviews");
  const id = Number(f.get("id"));
  const status = String(f.get("status") || "");
  if (!Number.isSafeInteger(id) || id < 1 || !["approved", "rejected"].includes(status)) return fail("/admin/reviews", "Choose a valid review action.");
  const review = db().prepare("SELECT r.product_id,p.slug FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE r.id=?").get(id);
  if (!review) return fail("/admin/reviews", "Review not found.");
  db().prepare("UPDATE product_reviews SET status=?,updated_at=datetime('now') WHERE id=?").run(status,id);
  logAdminActivity(a.email, status === "approved" ? "review_approved" : "review_rejected", "review", id);
  revalidatePath(`/product/${String(review.slug)}`);
  back("/admin/reviews", `Review ${status}.`);
}

export async function saveTestimonialAction(f: FormData) {
  const a = await requirePerm("reviews");
  const id = Number(f.get("id")) || 0;
  const name = s(f, "customerName", 80);
  const quote = text(f, "quote", 1000);
  if (name.length < 2 || quote.length < 10) return fail("/admin/reviews", "Enter the customer's name and their actual statement (at least 10 characters).");
  const approved = f.get("approved") === "on" ? 1 : 0;
  if (id) db().prepare("UPDATE testimonials SET customer_name=?,quote=?,approved=?,updated_at=datetime('now') WHERE id=?").run(name,quote,approved,id);
  else db().prepare("INSERT INTO testimonials (customer_name,quote,approved) VALUES (?,?,?)").run(name,quote,approved);
  logAdminActivity(a.email, id ? "testimonial_updated" : "testimonial_added", "testimonial", id || "new");
  revalidatePath("/");
  back("/admin/reviews", "Testimonial saved.");
}

export async function toggleTestimonialAction(f: FormData) {
  const a = await requirePerm("reviews");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return fail("/admin/reviews", "Choose a valid testimonial.");
  const r = db().prepare("UPDATE testimonials SET approved=1-approved,updated_at=datetime('now') WHERE id=?").run(id);
  if (!r.changes) return fail("/admin/reviews", "Testimonial not found.");
  logAdminActivity(a.email, "testimonial_visibility_toggled", "testimonial", id);
  revalidatePath("/");
  back("/admin/reviews", "Testimonial visibility updated.");
}

export async function saveCouponAction(f: FormData) {
  const a = await requirePerm("coupons");
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
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail("/admin/promotions", "Coupon code must be 3–40 letters, numbers, hyphens or underscores.", "code");
  if (!Number.isSafeInteger(value) || value < 1 || type === "percent" && value > 100) return fail("/admin/promotions", type === "percent" ? "Enter a percentage from 1 to 100." : "Enter a fixed discount of at least ₦1.", "discountValue");
  if (minimum == null || !/^\d+$/.test(minRaw) || usage != null && (!Number.isSafeInteger(usage) || usage < 1) || !Number.isSafeInteger(customerLimit) || customerLimit < 1 || customerLimit > 1000)
    return fail("/admin/promotions", "Check the minimum order, usage limit, and per-customer limit.", "minimumOrder");
  if (!dateOk(startsAt) || !dateOk(expiresAt) || startsAt && expiresAt && startsAt > expiresAt) return fail("/admin/promotions", "Enter valid dates and make sure expiry is after the start date.", "expiresAt");
  if (productIds.length && db().prepare(`SELECT COUNT(*) n FROM products WHERE id IN (${productIds.map(() => "?").join(",")})`).get(...productIds)?.n !== productIds.length)
    return fail("/admin/promotions", "One or more restricted products could not be found.");
  if (categorySlugs.length && db().prepare(`SELECT COUNT(*) n FROM categories WHERE slug IN (${categorySlugs.map(() => "?").join(",")})`).get(...categorySlugs)?.n !== categorySlugs.length)
    return fail("/admin/promotions", "One or more restricted categories could not be found.");
  const fields = [code,type,value,startsAt,expiresAt,usage,customerLimit,minimum,JSON.stringify(productIds),JSON.stringify(categorySlugs),f.get("active") === "on" ? 1 : 0];
  try {
    if (id) db().prepare(`UPDATE coupons SET code=?,discount_type=?,discount_value=?,starts_at=?,expires_at=?,usage_limit=?,customer_limit=?,minimum_order=?,product_ids=?,category_slugs=?,active=?,updated_at=datetime('now') WHERE id=?`).run(...fields,id);
    else db().prepare(`INSERT INTO coupons (code,discount_type,discount_value,starts_at,expires_at,usage_limit,customer_limit,minimum_order,product_ids,category_slugs,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...fields);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return fail("/admin/promotions", "That coupon code is already in use.", "code");
    throw error;
  }
  logAdminActivity(a.email, id ? "coupon_updated" : "coupon_created", "coupon", id || code, `${code} · ${type} ${value}`);
  revalidatePath("/checkout");
  back("/admin/promotions", "Coupon saved.");
}

export async function deleteCouponAction(f: FormData) {
  const a = await requirePerm("coupons");
  const id = Number(f.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return fail("/admin/promotions", "Choose a valid coupon.");
  const coupon = db().prepare("SELECT code FROM coupons WHERE id=?").get(id);
  if (!coupon) return fail("/admin/promotions", "Coupon not found.");
  const uses = Number(db().prepare("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=?").get(id)?.n || 0);
  if (uses) db().prepare("UPDATE coupons SET active=0,updated_at=datetime('now') WHERE id=?").run(id);
  else db().prepare("DELETE FROM coupons WHERE id=?").run(id);
  logAdminActivity(a.email, uses ? "coupon_deactivated_preserving_history" : "coupon_deleted", "coupon", id, `${String(coupon.code)} · ${uses} redemptions`);
  back("/admin/promotions", uses ? "Coupon deactivated. Its redemption history was kept." : "Coupon deleted.");
}

/* ---------- banners and homepage text ---------- */
async function bannerImage(f: FormData, field: string, pick: string, actor: string): Promise<{ url?: string; error?: string }> {
  const file = f.get(field);
  if (file && typeof file !== "string" && file.size) {
    const r = await saveImageUpload(file, actor);
    return r.error ? { error: r.error } : { url: r.media!.url };
  }
  const url = s(f, pick, 300);
  return safeImage(url) ? { url } : { error: "Choose an image from the media library." };
}

export async function saveBannerAction(f: FormData) {
  const a = await requirePerm("banners");
  const id = Number(f.get("id")) || 0;
  const heading = s(f, "heading", 120), description = text(f, "description", 400), buttonText = s(f, "buttonText", 40), buttonUrl = s(f, "buttonUrl", 300);
  const placement = f.get("placement") === "hero" ? "hero" : "promo";
  const startsAt = s(f, "startsAt", 10), endsAt = s(f, "endsAt", 10);
  const dateOk = (x: string) => !x || (/^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x);
  const ret = id ? `/admin/banners/${id}` : "/admin/banners/new";
  if (!heading && !f.get("desktopFile") && !s(f, "desktopImage", 300)) return fail(ret, "Add a heading or an image.", "heading");
  if (buttonText && !safeLink(buttonUrl)) return fail(ret, "The button link must start with / (a store page) or https://.", "buttonUrl");
  if (!dateOk(startsAt) || !dateOk(endsAt) || (startsAt && endsAt && startsAt > endsAt)) return fail(ret, "Check the dates. The end date must be on or after the start date.", "endsAt");
  const desk = await bannerImage(f, "desktopFile", "desktopImage", a.email);
  if (desk.error) return fail(ret, desk.error);
  const mob = await bannerImage(f, "mobileFile", "mobileImage", a.email);
  if (mob.error) return fail(ret, mob.error);
  const vals = [heading, description, buttonText, buttonText ? buttonUrl : "", desk.url || "", mob.url || "", s(f, "imageAlt", 160), placement, f.get("active") === "on" ? 1 : 0, startsAt, endsAt];
  let bid = id;
  if (id) {
    if (!db().prepare("SELECT 1 FROM banners WHERE id = ?").get(id)) return fail("/admin/banners", "Banner not found.");
    db().prepare("UPDATE banners SET heading=?, description=?, button_text=?, button_url=?, desktop_image=?, mobile_image=?, image_alt=?, placement=?, active=?, starts_at=?, ends_at=?, updated_at=datetime('now') WHERE id=?").run(...vals, id);
  } else {
    const sort = Number(db().prepare("SELECT COALESCE(MAX(sort),0)+1 n FROM banners").get()?.n || 1);
    bid = Number(db().prepare("INSERT INTO banners (heading, description, button_text, button_url, desktop_image, mobile_image, image_alt, placement, active, starts_at, ends_at, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(...vals, sort).lastInsertRowid);
  }
  logAdminActivity(a.email, id ? "banner_updated" : "banner_created", "banner", bid, `${heading} · ${placement} · ${vals[8] ? "on" : "off"}`);
  revalidatePath("/");
  back(`/admin/banners/${bid}`, "Banner saved. Use Preview to check it before switching it on.");
}

export async function bannerOpAction(f: FormData) {
  const a = await requirePerm("banners");
  const id = Number(f.get("id"));
  const op = s(f, "op", 20);
  const b = db().prepare("SELECT * FROM banners WHERE id = ?").get(id);
  if (!b) return fail("/admin/banners", "Banner not found.");
  if (op === "toggle") db().prepare("UPDATE banners SET active = 1 - active, updated_at = datetime('now') WHERE id = ?").run(id);
  else if (op === "duplicate") {
    const r = db().prepare(`INSERT INTO banners (heading, description, button_text, button_url, desktop_image, mobile_image, image_alt, placement, active, starts_at, ends_at, sort)
      SELECT heading || ' (copy)', description, button_text, button_url, desktop_image, mobile_image, image_alt, placement, 0, starts_at, ends_at, (SELECT COALESCE(MAX(sort),0)+1 FROM banners) FROM banners WHERE id = ?`).run(id);
    logAdminActivity(a.email, "banner_duplicated", "banner", Number(r.lastInsertRowid), `copy of ${id}`);
    revalidatePath("/");
    return back(`/admin/banners/${r.lastInsertRowid}`, "Copy created. It is switched off until you turn it on.");
  } else if (op === "delete") {
    if (f.get("confirm") !== "yes") return fail("/admin/banners", "Tick the box to confirm deleting the banner.");
    db().prepare("DELETE FROM banners WHERE id = ?").run(id);
  } else if (op === "up" || op === "down") {
    const list = db().prepare("SELECT id FROM banners WHERE placement = ? ORDER BY sort, id").all(b.placement).map((r) => Number(r.id));
    const i = list.indexOf(id); const j = op === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; tx((d) => list.forEach((bid, k) => d.prepare("UPDATE banners SET sort = ? WHERE id = ?").run(k + 1, bid))); }
  } else return fail("/admin/banners", "Unknown action.");
  logAdminActivity(a.email, `banner_${op}`, "banner", id, String(b.heading));
  revalidatePath("/");
  back("/admin/banners", op === "delete" ? "Banner deleted. Its images stay in the media library." : "Banner updated.");
}

export async function saveHomeHeroAction(f: FormData) {
  const a = await requirePerm("banners");
  const v = { title: s(f, "title", 80), accent: s(f, "accent", 60), text: text(f, "text", 300), primaryLabel: s(f, "primaryLabel", 40), primaryUrl: s(f, "primaryUrl", 200), secondaryLabel: s(f, "secondaryLabel", 40), secondaryUrl: s(f, "secondaryUrl", 200) };
  if (v.title.length < 3) return fail("/admin/banners", "Enter a homepage heading.", "title");
  if ((v.primaryLabel && !safeLink(v.primaryUrl)) || (v.secondaryLabel && !safeLink(v.secondaryUrl))) return fail("/admin/banners", "Button links must start with /, # or https://.");
  setSetting("homeHero", v);
  logAdminActivity(a.email, "homepage_text_updated", "settings", "homeHero", v.title);
  revalidatePath("/");
  back("/admin/banners", "Homepage text saved.");
}

/* ---------- SEO ---------- */
export async function saveSeoGlobalAction(f: FormData) {
  const a = await requirePerm("seo");
  const v = { titleTemplate: s(f, "titleTemplate", 80), homeTitle: s(f, "homeTitle", 90), homeDescription: text(f, "homeDescription", 300), defaultDescription: text(f, "defaultDescription", 300), ogImage: s(f, "ogImage", 300), noindexSite: f.get("noindexSite") === "on" };
  if (!v.titleTemplate.includes("%s")) return fail("/admin/seo", "The title template must contain %s where the page title goes.", "titleTemplate");
  if (v.homeTitle.length < 10 || v.homeDescription.length < 50) return fail("/admin/seo", "Write a homepage title (10+ characters) and description (50+ characters).", "homeDescription");
  if (v.ogImage && !safeImage(v.ogImage) && v.ogImage !== "/og.jpg") return fail("/admin/seo", "Choose the sharing image from the media library.");
  setSetting("seo", v);
  logAdminActivity(a.email, "seo_global_updated", "seo", "site", v.noindexSite ? "SEARCH ENGINES BLOCKED" : "indexing allowed");
  revalidatePath("/", "layout");
  back("/admin/seo", v.noindexSite ? "Saved. Search engines are now asked NOT to index the store." : "SEO settings saved.");
}

export async function saveItemSeoAction(f: FormData) {
  const a = await requirePerm("seo");
  const kind = f.get("kind") === "category" ? "category" : "product";
  const id = Number(f.get("id"));
  const title = s(f, "seoTitle", 90), desc = text(f, "metaDescription", 300), noindex = f.get("noindex") === "on" ? 1 : 0;
  if (kind === "product") {
    const og = s(f, "ogImage", 300);
    if (og && !safeImage(og)) return fail("/admin/seo", "Choose the sharing image from the media library.");
    const r = db().prepare("UPDATE products SET seo_title = ?, meta_description = ?, og_image = ?, noindex = ?, updated_at = datetime('now') WHERE id = ?").run(title, desc, og, noindex, id);
    if (!r.changes) return fail("/admin/seo", "Product not found.");
  } else {
    const r = db().prepare("UPDATE categories SET seo_title = ?, meta_description = ?, noindex = ?, updated_at = datetime('now') WHERE id = ?").run(title, desc, noindex, id);
    if (!r.changes) return fail("/admin/seo", "Category not found.");
  }
  logAdminActivity(a.email, `seo_${kind}_updated`, kind, id, `${title || "(default title)"}${noindex ? " · hidden from search" : ""}`);
  revalidatePath("/", "layout");
  back(`/admin/seo#${kind === "product" ? "p" : "c"}-${id}`, "Saved.");
}

export async function saveRedirectAction(f: FormData) {
  const a = await requirePerm("seo");
  const op = s(f, "op", 10);
  const from = s(f, "from", 200).replace(/\/+$/, "") || "/";
  if (op === "delete") {
    db().prepare("DELETE FROM redirects WHERE from_path = ?").run(from);
    logAdminActivity(a.email, "redirect_deleted", "redirect", from);
    return back("/admin/seo#redirects", "Redirect removed.");
  }
  const to = s(f, "to", 300);
  if (!validFromPath(from)) return fail("/admin/seo#redirects", "The old address must start with / and cannot be an admin, API, image or order address.", "from");
  if (!validToPath(to)) return fail("/admin/seo#redirects", "The new address must start with / or https://.", "to");
  if (to === from) return fail("/admin/seo#redirects", "The old and new addresses are the same.");
  if (db().prepare("SELECT 1 FROM redirects WHERE from_path = ?").get(to) && resolveRedirectFrom(to, from)) return fail("/admin/seo#redirects", "That would create a redirect loop.", "to");
  db().prepare("INSERT INTO redirects (from_path, to_path, created_by) VALUES (?,?,?) ON CONFLICT(from_path) DO UPDATE SET to_path = excluded.to_path").run(from, to, a.email);
  logAdminActivity(a.email, "redirect_saved", "redirect", from, `→ ${to}`);
  back("/admin/seo#redirects", "Redirect saved. It only applies to addresses that do not exist as pages.");
}
function resolveRedirectFrom(start: string, banned: string) {
  let cur = start;
  for (let i = 0; i < 10; i++) { if (cur === banned) return true; const r = db().prepare("SELECT to_path FROM redirects WHERE from_path = ?").get(cur); if (!r) return false; cur = String(r.to_path); }
  return true;
}
