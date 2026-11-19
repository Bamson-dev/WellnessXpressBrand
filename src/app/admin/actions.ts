"use server";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/lib/db";
import { hashPassword, login, logout, requireAdmin } from "@/lib/auth";
import { getOrderById, logEvent, orderItems } from "@/lib/orders";
import { adjustStock, recordMovement, releaseOrderStock, reserveOrderStock, type AdjustKind } from "@/lib/inventory";
import { setSetting } from "@/lib/settings";
import { deleteMedia, getMedia, saveImageUpload } from "@/lib/media";
import { sendStorePurchase } from "@/lib/meta";
import { clean, isEmail, sniffType } from "@/lib/validate";
import { limited } from "@/lib/ratelimit";
import { NIGERIAN_STATES, normalisePhone, site } from "@/lib/site";
import { logAdminActivity } from "@/lib/admin-events";

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

/* ---------- orders ---------- */
export async function setDeliveryFeeAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const fee = money(f.get("fee"));
  const o = getOrderById(id);
  if (!o || fee == null) return back(`/admin/orders/${id}`, "Enter a valid delivery fee.");
  if (o.delivery_payment_status === "paid") return back(`/admin/orders/${id}`, "Delivery payment is already confirmed.");
  db().prepare("UPDATE orders SET delivery_fee = ?, total = subtotal + ?, delivery_payment_status = ?, delivery_fee_source = 'admin', updated_at = datetime('now') WHERE id = ?").run(fee, fee, fee > 0 ? "pending" : "paid", id);
  logEvent(id, a.email, "delivery_fee_set", `₦${fee.toLocaleString()}${o.delivery_fee != null ? ` (was ₦${Number(o.delivery_fee).toLocaleString()})` : ""}`);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, "Delivery fee saved. The customer's order page now shows the final amount.");
}

export async function verifyPaymentAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const o = getOrderById(id);
  if (!o) return back("/admin/orders");
  if (f.get("confirm") !== "yes") return back(`/admin/orders/${id}`, "Tick the box to confirm you have seen the money in the bank account.");
  if (o.payment_status === "paid") return back(`/admin/orders/${id}`, "Payment is already confirmed.");
  db().prepare("UPDATE orders SET payment_status = 'paid', paid_at = datetime('now'), verified_by = ?, updated_at = datetime('now') WHERE id = ?").run(a.email, id);
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
  db().prepare("UPDATE orders SET payment_status = 'payment_failed', updated_at = datetime('now') WHERE id = ?").run(id);
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
  const err = tx((d) => {
    if (o.fulfilment_status === "cancelled" && st !== "cancelled") {
      const e = reserveOrderStock(d, id, a.email, `Order ${o.number} reopened`);
      if (e) return e;
    }
    d.prepare("UPDATE orders SET fulfilment_status = ?, updated_at = datetime('now') WHERE id = ?").run(st, id);
    if (st === "cancelled" && o.fulfilment_status !== "cancelled") releaseOrderStock(d, id, a.email, `Order ${o.number} cancelled`);
    return null;
  });
  if (err) return back(`/admin/orders/${id}`, `Cannot reopen this order: ${err}`);
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
  logAdminActivity(a.email, "create_product", "product", String(r.lastInsertRowid), name);
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
  logAdminActivity(a.email, "duplicate_product", "product", String(newId), `Copied from product ${id} as draft`);
  redirect(`/admin/products/${newId}?msg=${encodeURIComponent("Draft copy created. Review its options and contents before publishing.")}`);
}

export async function bulkProductsAction(f: FormData) {
  const a = await requireAdmin("owner");
  const ids = f.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  const op = s(f, "op", 20);
  if (!ids.length) return back("/admin/products", "Tick at least one product.");
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
  if (!sql[op]) return back("/admin/products", "Choose a bulk action.");
  db().prepare(`UPDATE products SET ${sql[op]}, updated_at=datetime('now') WHERE id IN (${ph})`).run(...ids);
  revalidatePath("/", "layout");
  audit(a, "bulkProductsAction", f, `${ids.length} records: ${op}`);
  back("/admin/products", `${ids.length} product${ids.length === 1 ? "" : "s"} updated.`);
}

/** Permanent delete is only allowed for archived products that never appeared in an order or a combo. */
export async function deleteProductAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const p = db().prepare("SELECT status, name FROM products WHERE id = ?").get(id);
  if (!p) return back("/admin/products", "Product not found.");
  if (p.status !== "archived") return back(`/admin/products/${id}`, "Archive the product first. Only archived products can be deleted.");
  if (db().prepare("SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1").get(id)) return back(`/admin/products/${id}`, "This product is in past orders, so it is kept for your records. It stays archived and hidden.");
  if (db().prepare("SELECT 1 FROM combo_items WHERE item_product_id = ? LIMIT 1").get(id)) return back(`/admin/products/${id}`, "A combo set still includes this product. Remove it from the combo first.");
  if (f.get("confirm") !== String(p.name)) return back(`/admin/products/${id}`, "Type the product name exactly to confirm deletion.");
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
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const exists = db().prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!exists) return back("/admin/products", "Product not found.");
  db().prepare("UPDATE products SET status='archived', updated_at=datetime('now') WHERE id=?").run(id);
  revalidatePath("/", "layout");
  audit(a, "archiveProductAction", f, "");
  back("/admin/products", "Product archived. Historical order records were retained.");
}

export async function createCategoryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const name = s(f, "name", 80);
  if (name.length < 2) return back("/admin/categories", "Enter a category name.");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  if (!slug) return back("/admin/categories", "Use a category name containing letters or numbers.");
  if (db().prepare("SELECT 1 FROM categories WHERE slug = ?").get(slug)) return back("/admin/categories", "A category already uses that web address.");
  db().prepare("INSERT INTO categories (slug,name,description,image,sort,status) VALUES (?,?,?,'',?,'hidden')")
    .run(slug, name, text(f, "description", 1000), Number(f.get("sort")) || 0);
  audit(a, "createCategoryAction", f, "");
  back("/admin/categories", "Category created hidden. Review its details and publish it when ready.");
}

export async function saveCategoryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const current = db().prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!current) return back("/admin/categories", "Category not found.");
  const slug = s(f, "slug", 70).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
  const duplicate = db().prepare("SELECT 1 FROM categories WHERE slug = ? AND id != ?").get(slug, id);
  const used = Number(db().prepare("SELECT COUNT(*) n FROM products WHERE category = ?").get(current.slug)?.n || 0);
  if (!slug || duplicate) return back("/admin/categories", "That slug is empty or already used.");
  if (used && slug !== current.slug) return back("/admin/categories", "This category is assigned to products. Keep its slug to preserve existing category URLs.");
  if (slug !== current.slug) {
    db().prepare("UPDATE category_redirects SET new_slug = ? WHERE new_slug = ?").run(slug, current.slug);
    db().prepare("INSERT INTO category_redirects (old_slug,new_slug) VALUES (?,?) ON CONFLICT(old_slug) DO UPDATE SET new_slug=excluded.new_slug").run(current.slug, slug);
  }
  const status = f.get("status") === "published" ? "published" : "hidden";
  const image = s(f, "image", 300);
  if (image && !image.startsWith("/images/") && !/^\/media\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(image))
    return back("/admin/categories", "Choose a project image path or an uploaded media URL.");
  db().prepare(`UPDATE categories SET slug=?,name=?,description=?,image=?,seo_title=?,meta_description=?,status=?,sort=?,updated_at=datetime('now') WHERE id=?`)
    .run(slug, s(f, "name", 80), text(f, "description", 1000), image, s(f, "seoTitle", 120), text(f, "metaDescription", 300), status, Number(f.get("sort")) || 0, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${slug}`);
  audit(a, "saveCategoryAction", f, "");
  back("/admin/categories", "Category saved.");
}

export async function uploadCategoryImageAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const category = db().prepare("SELECT slug FROM categories WHERE id = ?").get(id);
  if (!category) return back("/admin/categories", "Category not found.");
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return back("/admin/categories", "Choose an image to upload.");
  const r = await saveImageUpload(file, a.email);
  if (r.error) return back("/admin/categories", r.error);
  db().prepare("UPDATE categories SET image=?,updated_at=datetime('now') WHERE id=?").run(r.media!.url, id);
  revalidatePath("/", "layout");
  revalidatePath(`/category/${String(category.slug)}`);
  audit(a, "uploadCategoryImageAction", f, "");
  back("/admin/categories", "Category image uploaded to the media library and saved.");
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
  audit(a, "saveProductAction", f, "");
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
  const stock = stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw)) || 0);
  if (!label || price == null || price < 1) return back(`/admin/products/${pid}`, "Each price option needs a name and a price.");
  if (sale != null && sale >= price) return back(`/admin/products/${pid}`, "The sale price must be lower than the price.");
  const status = ["active", "inactive"].includes(s(f, "status", 20)) ? s(f, "status", 20) : "active";
  let sku = s(f, "sku", 60).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!sku) sku = `WX-${pid}-${label.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  if (db().prepare("SELECT 1 FROM variants WHERE sku = ? AND id != ?").get(sku, vid)) return back(`/admin/products/${pid}`, `SKU ${sku} is already used.`);
  const vals = [label, s(f, "size", 60), s(f, "duration", 60), sku, price, sale, stock, status, f.get("confirmed") ? 0 : 1, Number(f.get("sort")) || 0];
  const admin = await requireAdmin("owner");
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
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const vid = Number(f.get("variantId"));
  const used = db().prepare("SELECT 1 FROM order_items WHERE variant_id = ?").get(vid);
  if (used) db().prepare("UPDATE variants SET status = 'inactive' WHERE id = ?").run(vid);
  else db().prepare("DELETE FROM variants WHERE id = ? AND product_id = ?").run(vid, pid);
  audit(a, "deleteVariantAction", f, "");
  back(`/admin/products/${pid}`, used ? "This option has past orders, so it was switched off instead of deleted." : "Price option deleted.");
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
  audit(a, "saveComboItemsAction", f, "");
  back(`/admin/products/${pid}`, "Set contents saved.");
}

export async function uploadImageAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const files = f.getAll("image").filter((x): x is File => typeof x !== "string" && x.size > 0).slice(0, 10);
  if (!files.length) return back(`/admin/products/${pid}`, "Choose an image to upload.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  if (!p) return back("/admin/products", "Product not found.");
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
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return back(`/admin/products/${pid}`, "Choose the new image.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return back(`/admin/products/${pid}`);
  const r = await saveImageUpload(file, a.email);
  if (r.error) return back(`/admin/products/${pid}`, r.error);
  const old = imgs[idx];
  imgs[idx] = r.media!.url;
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "replaceImageAction", f, "");
  back(`/admin/products/${pid}`, `Image replaced. The old image (${old.split("/").pop()}) stays in the media library.`);
}

export async function addFromLibraryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const m = getMedia(Number(f.get("mediaId")));
  if (!m) return back(`/admin/products/${pid}`, "Choose an image from the library.");
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (imgs.includes(m.url)) return back(`/admin/products/${pid}`, "That image is already in this product's gallery.");
  imgs.push(m.url);
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  audit(a, "addFromLibraryAction", f, "");
  back(`/admin/products/${pid}`, "Image added from the media library.");
}

export async function libraryUploadAction(f: FormData) {
  const a = await requireAdmin("owner");
  const files = f.getAll("images").filter((x): x is File => typeof x !== "string" && x.size > 0).slice(0, 20);
  if (!files.length) return back("/admin/media", "Choose at least one image.");
  const errors: string[] = [];
  let ok = 0;
  for (const file of files) { const r = await saveImageUpload(file, a.email); if (r.error) errors.push(r.error); else ok++; }
  audit(a, "libraryUploadAction", f, "");
  back("/admin/media", `${ok} uploaded.${errors.length ? " Not uploaded: " + errors.join(" ") : ""}`);
}

export async function saveMediaMetaAction(f: FormData) {
  const a = await requireAdmin("owner");
  const id = Number(f.get("id"));
  const ret = s(f, "back", 200).startsWith("/admin/") ? s(f, "back", 200) : "/admin/media";
  db().prepare("UPDATE media SET alt = ?, caption = ? WHERE id = ?").run(s(f, "alt", 150), s(f, "caption", 200), id);
  revalidatePath("/", "layout");
  audit(a, "saveMediaMetaAction", f, "");
  back(ret, "Image text saved.");
}

export async function deleteMediaAction(f: FormData) {
  const a = await requireAdmin("owner");
  const err = await deleteMedia(Number(f.get("id")));
  if (!err) audit(a, "deleteMediaAction", f, "");
  back("/admin/media", err || "Image deleted.");
}

export async function imageOrderAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const op = s(f, "op", 10);
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return back(`/admin/products/${pid}`);
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
  const a = await requireAdmin("owner");
  const vid = Number(f.get("variantId"));
  const kind = s(f, "kind", 20) as AdjustKind;
  const back2 = s(f, "back", 200).startsWith("/admin/") ? s(f, "back", 200) : "/admin/inventory";
  if (!["opening", "increase", "decrease", "correction", "untrack"].includes(kind)) return back(back2, "Choose a stock action.");
  const qty = kind === "untrack" ? 0 : Number(String(f.get("qty") ?? "").trim());
  const err = adjustStock(vid, kind, qty, s(f, "note", 300), a.email);
  revalidatePath("/", "layout");
  if (!err) audit(a, "adjustStockAction", f, `${kind} ${qty}${s(f, "note", 300) ? ` · ${s(f, "note", 300)}` : ""}`);
  back(back2, err || "Stock updated and recorded in the history.");
}
export async function setThresholdAction(f: FormData) {
  const a = await requireAdmin("owner");
  const vid = Number(f.get("variantId"));
  const raw = String(f.get("threshold") ?? "").trim();
  const t = raw === "" ? null : Math.floor(Number(raw));
  if (t != null && (!Number.isFinite(t) || t < 0 || t > 100000)) return back("/admin/inventory", "Enter a whole number for the low-stock level, or leave it empty.");
  db().prepare("UPDATE variants SET low_stock_threshold = ? WHERE id = ?").run(t, vid);
  audit(a, "setThresholdAction", f, `low-stock level ${t ?? "none"}`);
  back("/admin/inventory", "Low-stock level saved.");
}

/* ---------- delivery ---------- */
type ZoneInput = { state: string; fee: number | null; active: boolean; eta: string; note: string };
function writeZones(rows: ZoneInput[]) {
  tx((d) => {
    for (const z of rows) {
      d.prepare(`INSERT INTO delivery_zones (state, fee, active, eta, note, updated_at) VALUES (?,?,?,?,?, datetime('now'))
        ON CONFLICT(state) DO UPDATE SET fee=excluded.fee, active=excluded.active, eta=excluded.eta, note=excluded.note, updated_at=datetime('now')`)
        .run(z.state, z.fee, z.fee == null ? 0 : z.active ? 1 : 0, z.eta, z.note);
    }
  });
}

export async function saveDeliveryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const rows: ZoneInput[] = [];
  const bad: string[] = [];
  for (const st of NIGERIAN_STATES) {
    const raw = String(f.get(`fee_${st}`) ?? "").trim();
    const fee = raw === "" ? null : money(raw);
    if (raw !== "" && fee == null) { bad.push(st); continue; }
    rows.push({ state: st, fee, active: !!f.get(`active_${st}`), eta: s(f, `eta_${st}`, 80), note: s(f, `note_${st}`, 160) });
  }
  if (bad.length) return back("/admin/delivery", `Fix the fee for: ${bad.join(", ")}. Use numbers only, for example 3500.`);
  writeZones(rows);
  revalidatePath("/checkout");
  const off = rows.filter((r) => r.fee == null && r.active).map((r) => r.state);
  audit(a, "saveDeliveryAction", f, "");
  back("/admin/delivery", off.length ? `Saved. ${off.length} state(s) are switched on but have no fee, so they stay unavailable: ${off.join(", ")}.` : "Delivery settings saved.");
}

export async function bulkDeliveryAction(f: FormData) {
  const a = await requireAdmin("owner");
  const states = f.getAll("states").map(String).filter((x) => NIGERIAN_STATES.includes(x));
  if (!states.length) return back("/admin/delivery", "Tick at least one state for the bulk update.");
  const op = s(f, "op", 20);
  const current = new Map(db().prepare("SELECT * FROM delivery_zones").all().map((r) => [String(r.state), r]));
  const feeRaw = String(f.get("bulkFee") ?? "").trim();
  const fee = feeRaw === "" ? undefined : money(feeRaw);
  if (op === "fee" && (fee == null)) return back("/admin/delivery", "Enter a valid fee for the selected states.");
  const rows: ZoneInput[] = states.map((st) => {
    const c = current.get(st);
    const base: ZoneInput = { state: st, fee: c?.fee == null ? null : Number(c.fee), active: c ? Number(c.active) === 1 : false, eta: String(c?.eta || ""), note: String(c?.note || "") };
    if (op === "fee") return { ...base, fee: fee as number, active: true };
    if (op === "eta") return { ...base, eta: s(f, "bulkEta", 80) };
    if (op === "enable") return { ...base, active: true };
    if (op === "disable") return { ...base, active: false };
    if (op === "clear") return { ...base, fee: null, active: false };
    return base;
  });
  writeZones(rows);
  revalidatePath("/checkout");
  audit(a, "bulkDeliveryAction", f, `${rows.length} state(s)`);
  back("/admin/delivery", `Updated ${rows.length} state(s).`);
}

/** Parses a delivery CSV (State,Fee,Enabled,ETA,Note). Returns rows plus per-line problems. Nothing is saved here. */
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
  lines.forEach((l, n) => {
    const c = split(l);
    if (n === 0 && /^state$/i.test(c[0])) return;
    const st = NIGERIAN_STATES.find((x) => x.toLowerCase() === (c[0] || "").toLowerCase() || (/^fct|abuja/i.test(c[0] || "") && x.startsWith("FCT")));
    if (!st) { problems.push(`Line ${n + 1}: "${(c[0] || "").slice(0, 40)}" is not a Nigerian state.`); return; }
    if (seen.has(st)) { problems.push(`Line ${n + 1}: ${st} appears more than once.`); return; }
    seen.add(st);
    const feeRaw = (c[1] || "").replace(/[₦,\s]/g, "");
    const fee = feeRaw === "" ? null : /^\d+$/.test(feeRaw) && Number(feeRaw) <= 10_000_000 ? Number(feeRaw) : NaN;
    if (Number.isNaN(fee)) { problems.push(`Line ${n + 1}: fee "${(c[1] || "").slice(0, 20)}" for ${st} is not a number.`); return; }
    const en = (c[2] || "").toLowerCase();
    if (en && !["yes", "no", "true", "false", "1", "0", "y", "n"].includes(en)) { problems.push(`Line ${n + 1}: Enabled must be yes or no.`); return; }
    rows.push({ state: st, fee, active: ["yes", "true", "1", "y"].includes(en) || (en === "" && fee != null), eta: clean(c[3] || "", 80), note: clean(c[4] || "", 160) });
  });
  return { rows, problems };
}

export async function previewDeliveryImportAction(_: unknown, f: FormData) {
  await requireAdmin("owner");
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
  const a = await requireAdmin("owner");
  const { rows, problems } = parseDeliveryCsv(String(f.get("csv") || ""));
  if (problems.length) return back("/admin/delivery", "Import cancelled. The file has problems; preview it again and fix them first.");
  if (!rows.length) return back("/admin/delivery", "Nothing to import.");
  writeZones(rows);
  revalidatePath("/checkout");
  audit(a, "applyDeliveryImportAction", f, "");
  back("/admin/delivery", `Imported ${rows.length} state(s). States not in the file were not changed.`);
}

/* ---------- settings ---------- */
export async function saveBankAction(f: FormData) {
  const a = await requireAdmin("owner");
  const bank = s(f, "bank", 80);
  const accountName = s(f, "accountName", 120);
  const accountNumber = s(f, "accountNumber", 20).replace(/\D/g, "");
  if (!bank || !accountName || !/^\d{10}$/.test(accountNumber)) return back("/admin/settings", "Enter the bank name, account name and a 10-digit account number.");
  setSetting("bank", { bank, accountName, accountNumber });
  console.info(`[admin] bank details updated by ${a.email}`);
  audit(a, "saveBankAction", f, "");
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
  revalidatePath("/", "layout");
  audit(a, "saveContactAction", f, "");
  back("/admin/settings", "Contact details saved.");
}
export async function saveContentAction(f: FormData) {
  const a = await requireAdmin("owner");
  for (const k of ["announcement", "about", "productNotice", "shippingPolicy", "returnsPolicy", "privacyPolicy", "termsPolicy"]) {
    if (f.has(k)) setSetting(k, text(f, k, k === "announcement" ? 200 : 8000));
  }
  revalidatePath("/", "layout");
  audit(a, "saveContentAction", f, "");
  back("/admin/settings", "Content saved.");
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
  db().prepare("INSERT INTO users (email,name,role,password_hash) VALUES (?,?,?,?)").run(email, name, role, hashPassword(pw));
  logAdminActivity(a.email, "add_user", "user", email, role);
  back("/admin/users", "User added.");
}
export async function toggleUserAction(f: FormData) {
  const a = await requireAdmin("owner");
  db().prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(Number(f.get("id")));
  audit(a, "toggleUserAction", f, "");
  back("/admin/users", "User updated.");
}
export async function resetUserPasswordAction(f: FormData) {
  const a = await requireAdmin("owner");
  const pw = String(f.get("password") || "");
  if (pw.length < 10) return back("/admin/users", "The password must be at least 10 characters.");
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), Number(f.get("id")));
  audit(a, "resetUserPasswordAction", f, "");
  back("/admin/users", "Password changed.");
}

/* ---------- notifications, reviews, testimonials, coupons (ported from the Codex checkpoint) ---------- */
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
