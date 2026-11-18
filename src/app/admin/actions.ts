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

/* ---------- orders ---------- */
export async function setDeliveryFeeAction(f: FormData) {
  const a = await requireAdmin();
  const id = Number(f.get("id"));
  const fee = money(f.get("fee"));
  const o = getOrderById(id);
  if (!o || fee == null) return back(`/admin/orders/${id}`, "Enter a valid delivery fee.");
  if (o.payment_status === "paid") return back(`/admin/orders/${id}`, "This order is already paid. The total cannot change.");
  db().prepare("UPDATE orders SET delivery_fee = ?, total = subtotal + ?, updated_at = datetime('now') WHERE id = ?").run(fee, fee, id);
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
  if (o.total == null) return back(`/admin/orders/${id}`, "Set the delivery fee before you confirm payment.");
  if (o.payment_status === "paid") return back(`/admin/orders/${id}`, "Payment is already confirmed.");
  db().prepare("UPDATE orders SET payment_status = 'paid', paid_at = datetime('now'), verified_by = ?, updated_at = datetime('now') WHERE id = ?").run(a.email, id);
  logEvent(id, a.email, "payment_verified", s(f, "note", 300));
  const skus = orderItems(id).map((i) => i.sku);
  const ev = await sendStorePurchase({ number: o.number, total: o.total, skus, url: `${site.url}/order/${o.number}`, tracking: String(o.tracking || "{}") });
  db().prepare("UPDATE orders SET purchase_event_id = ?, purchase_event_status = ? WHERE id = ?").run(ev.eventId, ev.status, id);
  revalidatePath("/admin");
  back(`/admin/orders/${id}`, "Payment confirmed. The order is now Paid.");
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
  if (["processing", "shipped", "delivered"].includes(st) && o.payment_status !== "paid") return back(`/admin/orders/${id}`, "Confirm payment before you process or ship this order.");
  if (st === o.fulfilment_status) return back(`/admin/orders/${id}`);
  tx((d) => {
    d.prepare("UPDATE orders SET fulfilment_status = ?, updated_at = datetime('now') WHERE id = ?").run(st, id);
    if (st === "cancelled" && o.fulfilment_status !== "cancelled") restoreStock(id);
    if (o.fulfilment_status === "cancelled" && st !== "cancelled") {
      for (const it of orderItems(id)) d.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL").run(it.qty, it.variant_id);
    }
  });
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
  await requireAdmin("owner");
  const name = s(f, "name", 120);
  const type = f.get("type") === "combo" ? "combo" : "single";
  if (name.length < 2) return back("/admin/products", "Enter a product name.");
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "product";
  while (db().prepare("SELECT 1 FROM products WHERE slug = ?").get(slug)) slug += "-2";
  const r = db().prepare("INSERT INTO products (slug,name,type,category,status,sort) VALUES (?,?,?,?, 'draft', 999)").run(slug, name, type, type === "combo" ? "combos" : "individual");
  redirect(`/admin/products/${r.lastInsertRowid}?msg=${encodeURIComponent("Product created as a draft. Add a price option and a photo, then publish it.")}`);
}

export async function saveProductAction(f: FormData) {
  await requireAdmin("owner");
  const id = Number(f.get("id"));
  const p = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!p) return back("/admin/products");
  const slug = s(f, "slug", 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!slug || db().prepare("SELECT 1 FROM products WHERE slug = ? AND id != ?").get(slug, id)) return back(`/admin/products/${id}`, "That web address (slug) is empty or already used.");
  const status = STATUSES.includes(s(f, "status", 30)) ? s(f, "status", 30) : "draft";
  if (status === "published" && !db().prepare("SELECT 1 FROM variants WHERE product_id = ? AND status = 'active'").get(id))
    return back(`/admin/products/${id}`, "Add at least one active price option before you publish.");
  const faqs = text(f, "faqs", 6000).split(/\n{2,}/).map((b) => b.split("\n")).filter((b) => b[0]?.startsWith("Q:")).map((b) => ({ q: b[0].slice(2).trim(), a: b.slice(1).join(" ").replace(/^A:\s*/, "").trim() })).filter((x) => x.q && x.a);
  const related = s(f, "related", 500).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  db().prepare(
    `UPDATE products SET name=?, slug=?, category=?, short_description=?, description=?, information=?, ingredients=?, directions=?, faqs=?, related=?,
     status=?, featured=?, sort=?, review_note=?, updated_at=datetime('now') WHERE id=?`
  ).run(s(f, "name", 120), slug, f.get("category") === "combos" ? "combos" : "individual", s(f, "short", 300), text(f, "description"), text(f, "information"),
    text(f, "ingredients", 2000), text(f, "directions", 4000), JSON.stringify(faqs), JSON.stringify(related), status, f.get("featured") ? 1 : 0,
    Number(f.get("sort")) || 0, text(f, "review", 2000), id);
  revalidatePath("/", "layout");
  back(`/admin/products/${id}`, "Product saved.");
}

export async function saveVariantAction(f: FormData) {
  await requireAdmin("owner");
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
  if (vid) db().prepare("UPDATE variants SET label=?, size=?, duration=?, sku=?, price=?, sale_price=?, stock=?, status=?, needs_confirmation=?, sort=? WHERE id=? AND product_id=?").run(...vals, vid, pid);
  else db().prepare("INSERT INTO variants (label,size,duration,sku,price,sale_price,stock,status,needs_confirmation,sort,product_id,price_source) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'Added in admin')").run(...vals, pid);
  db().prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").run(pid);
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

export async function saveComboItemsAction(f: FormData) {
  await requireAdmin("owner");
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
  back(`/admin/products/${pid}`, "Set contents saved.");
}

export async function uploadImageAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const file = f.get("image");
  if (!file || typeof file === "string" || !file.size) return back(`/admin/products/${pid}`, "Choose an image to upload.");
  if (file.size > 6 * 1024 * 1024) return back(`/admin/products/${pid}`, "The image must be 6 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type || type === "pdf") return back(`/admin/products/${pid}`, "Upload a JPG, PNG or WebP image.");
  const name = `${randomBytes(12).toString("hex")}.${type}`;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), buf);
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  imgs.push(`/media/${name}`);
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, "Image uploaded.");
}

export async function imageOrderAction(f: FormData) {
  await requireAdmin("owner");
  const pid = Number(f.get("productId"));
  const idx = Number(f.get("index"));
  const op = s(f, "op", 10);
  const p = db().prepare("SELECT images FROM products WHERE id = ?").get(pid);
  const imgs = JSON.parse(String(p?.images || "[]")) as string[];
  if (!(idx >= 0 && idx < imgs.length)) return back(`/admin/products/${pid}`);
  if (op === "remove") imgs.splice(idx, 1);
  if (op === "first") imgs.unshift(...imgs.splice(idx, 1));
  db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(imgs), pid);
  revalidatePath("/", "layout");
  back(`/admin/products/${pid}`, op === "remove" ? "Image removed from this product." : "Main image updated.");
}

/* ---------- delivery ---------- */
export async function saveDeliveryAction(f: FormData) {
  const a = await requireAdmin("owner");
  tx((d) => {
    for (const st of NIGERIAN_STATES) {
      const raw = String(f.get(`fee_${st}`) ?? "").trim();
      const fee = raw === "" ? null : money(raw);
      d.prepare("INSERT INTO delivery_zones (state, fee, active, note) VALUES (?,?,?,?) ON CONFLICT(state) DO UPDATE SET fee=excluded.fee, active=excluded.active, note=excluded.note")
        .run(st, fee, f.get(`active_${st}`) ? 1 : 0, s(f, `note_${st}`, 120));
    }
  });
  void a;
  back("/admin/delivery", "Delivery fees saved.");
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
  back("/admin/settings", "Bank details saved. New orders show these details.");
}
export async function saveContactAction(f: FormData) {
  await requireAdmin("owner");
  const whatsapp = normalisePhone(s(f, "whatsapp", 30));
  const email = s(f, "email", 254).toLowerCase();
  if (!whatsapp) return back("/admin/settings", "Enter a valid Nigerian WhatsApp number.");
  if (email && !isEmail(email)) return back("/admin/settings", "Enter a valid email address.");
  const url = (k: string) => { const v = s(f, k, 200); return /^https:\/\/[^\s]+$/.test(v) ? v : ""; };
  setSetting("contact", { whatsapp, email, instagram: url("instagram"), facebook: url("facebook"), tiktok: url("tiktok") });
  revalidatePath("/", "layout");
  back("/admin/settings", "Contact details saved.");
}
export async function saveContentAction(f: FormData) {
  await requireAdmin("owner");
  for (const k of ["announcement", "about", "productNotice", "shippingPolicy", "returnsPolicy", "privacyPolicy", "termsPolicy"]) {
    if (f.has(k)) setSetting(k, text(f, k, k === "announcement" ? 200 : 8000));
  }
  revalidatePath("/", "layout");
  back("/admin/settings", "Content saved.");
}

/* ---------- users ---------- */
export async function addUserAction(f: FormData) {
  await requireAdmin("owner");
  const email = s(f, "email", 254).toLowerCase();
  const name = s(f, "name", 80);
  const pw = String(f.get("password") || "");
  const role = f.get("role") === "owner" ? "owner" : "staff";
  if (!isEmail(email) || name.length < 2) return back("/admin/users", "Enter a name and a valid email.");
  if (pw.length < 10) return back("/admin/users", "The password must be at least 10 characters.");
  if (db().prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return back("/admin/users", "A user with that email already exists.");
  db().prepare("INSERT INTO users (email,name,role,password_hash) VALUES (?,?,?,?)").run(email, name, role, hashPassword(pw));
  back("/admin/users", "User added.");
}
export async function toggleUserAction(f: FormData) {
  await requireAdmin("owner");
  db().prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(Number(f.get("id")));
  back("/admin/users", "User updated.");
}
export async function resetUserPasswordAction(f: FormData) {
  await requireAdmin("owner");
  const pw = String(f.get("password") || "");
  if (pw.length < 10) return back("/admin/users", "The password must be at least 10 characters.");
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), Number(f.get("id")));
  back("/admin/users", "Password changed.");
}
