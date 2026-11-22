import "server-only";
import { db, tx } from "@/lib/db";
import { bankOf, getOrderById, orderItems, type OrderRow } from "@/lib/orders";
import { getContact } from "@/lib/settings";
import { site } from "@/lib/site";

/**
 * Invoices. One invoice per order, numbered INV-YYYY-00001 in the order they are created.
 * All amounts come from the order record (the order is the snapshot), so an invoice can never disagree with its order.
 * An invoice shows PAID only when the product payment was verified by an admin (and any old separate delivery
 * fee was verified too).
 */
export type InvoiceStatus = "paid" | "part_paid" | "unpaid" | "cancelled";
export type Invoice = {
  number: string; createdAt: string; order: OrderRow;
  lines: { name: string; label: string; sku: string; qty: number; unitPrice: number; lineTotal: number; discount: number }[];
  itemsSubtotal: number; discount: number; couponCode: string; productTotal: number;
  freeDelivery: boolean; bundledDelivery: boolean; deliveryFee: number | null; total: number; amountPaid: number; balance: number;
  status: InvoiceStatus; productPaidAt: string | null; deliveryPaidAt: string | null;
  bank: { bank: string; accountName: string; accountNumber: string };
};

export function ensureInvoice(orderId: number, actor = "system"): string | null {
  return tx((d) => {
    const existing = d.prepare("SELECT number FROM invoices WHERE order_id = ?").get(orderId);
    if (existing) return String(existing.number);
    const o = d.prepare("SELECT id, created_at FROM orders WHERE id = ?").get(orderId);
    if (!o) return null;
    const year = new Date().getUTCFullYear();
    const n = Number(d.prepare("SELECT COUNT(*) n FROM invoices WHERE number LIKE ?").get(`INV-${year}-%`)?.n || 0) + 1;
    let number = `INV-${year}-${String(n).padStart(5, "0")}`;
    for (let k = n + 1; d.prepare("SELECT 1 FROM invoices WHERE number = ?").get(number); k++) number = `INV-${year}-${String(k).padStart(5, "0")}`;
    d.prepare("INSERT INTO invoices (number, order_id, created_by) VALUES (?,?,?)").run(number, orderId, actor.slice(0, 254));
    return number;
  });
}

export function invoiceFor(orderId: number): Invoice | null {
  const inv = db().prepare("SELECT number, created_at FROM invoices WHERE order_id = ?").get(orderId);
  const o = getOrderById(orderId);
  if (!inv || !o) return null;
  const items = orderItems(orderId);
  const lines = items.map((i) => ({ name: i.name, label: i.variant_label, sku: i.sku, qty: i.qty, unitPrice: i.unit_price, lineTotal: i.line_total, discount: Number(i.discount_amount || 0) }));
  const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = Number(o.discount_amount || 0);
  const bundledDelivery = o.delivery_fee_source === "included_in_order";
  const freeDelivery = !bundledDelivery && (o.delivery_fee_source === "free_delivery" || o.delivery_payment_status === "not_required");
  const deliveryFee = freeDelivery ? 0 : o.delivery_fee == null ? null : Number(o.delivery_fee);
  const productTotal = Number(o.subtotal);
  const total = productTotal + (deliveryFee || 0);
  const productPaid = o.payment_status === "paid";
  const deliveryPaid = bundledDelivery || freeDelivery || deliveryFee === 0 || o.delivery_payment_status === "paid";
  const amountPaid = productPaid ? (bundledDelivery ? total : productTotal) + (deliveryPaid && !bundledDelivery && deliveryFee ? deliveryFee : 0) : 0;
  const status: InvoiceStatus = o.fulfilment_status === "cancelled" && !productPaid ? "cancelled"
    : productPaid && deliveryPaid && deliveryFee !== null ? "paid" : amountPaid > 0 ? "part_paid" : "unpaid";
  return {
    number: String(inv.number), createdAt: String(inv.created_at), order: o, lines, itemsSubtotal, discount, couponCode: String(o.coupon_code || ""),
    productTotal, freeDelivery, bundledDelivery, deliveryFee, total, amountPaid, balance: Math.max(0, total - amountPaid), status,
    productPaidAt: o.paid_at ? String(o.paid_at) : null, deliveryPaidAt: o.delivery_paid_at ? String(o.delivery_paid_at) : null, bank: bankOf(o),
  };
}

export const INVOICE_STATUS: Record<InvoiceStatus, string> = { paid: "Paid", part_paid: "Part paid", unpaid: "Unpaid", cancelled: "Cancelled" };

export function listInvoices(f: { q?: string; status?: string; page?: number }) {
  const where: string[] = []; const p: unknown[] = [];
  if (f.q) { const like = `%${f.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`; where.push("(i.number LIKE ? ESCAPE '\\' OR o.number LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR o.phone LIKE ? ESCAPE '\\')"); p.push(like, like, like, like); }
  if (f.status === "paid") where.push("o.payment_status = 'paid'");
  if (f.status === "unpaid") where.push("o.payment_status != 'paid' AND o.fulfilment_status != 'cancelled'");
  if (f.status === "cancelled") where.push("o.fulfilment_status = 'cancelled'");
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const page = Math.max(1, f.page || 1);
  const total = Number(db().prepare(`SELECT COUNT(*) n FROM invoices i JOIN orders o ON o.id = i.order_id ${w}`).get(...p)?.n || 0);
  const rows = db().prepare(`SELECT i.number, i.created_at, o.id order_id, o.number order_number, o.customer_name, o.subtotal, o.delivery_fee, o.delivery_payment_status, o.payment_status, o.fulfilment_status
    FROM invoices i JOIN orders o ON o.id = i.order_id ${w} ORDER BY i.id DESC LIMIT 50 OFFSET ?`).all(...p, (page - 1) * 50);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 50)) };
}

const money = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
/** Characters the embedded font subset covers (Latin, ₦, common punctuation). Anything else becomes "?" so a PDF never fails. */
const SAFE = /[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20A6\u2212]/;
const ascii = (s: string) => [...s.replace(/\s+/g, " ")].map((ch) => (SAFE.test(ch) ? ch : "?")).join("");

/** Noto Sans (SIL Open Font License 1.1, see public/fonts/NotoSans-OFL.txt), subset to Latin + ₦. */
let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;
async function fonts() {
  if (fontCache) return fontCache;
  const { readFile } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "public", "fonts");
  fontCache = { regular: await readFile(path.join(dir, "NotoSans-Regular-subset.ttf")), bold: await readFile(path.join(dir, "NotoSans-Bold-subset.ttf")) };
  return fontCache;
}

/** PDF version of the invoice (A4), with the naira sign rendered by the embedded Noto Sans font. */
export async function invoicePdf(inv: Invoice): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await fonts();
  doc.setTitle(`Invoice ${inv.number}`); doc.setAuthor(site.name); doc.setCreator(site.name);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(f.regular, { subset: true });
  const bold = await doc.embedFont(f.bold, { subset: true });
  const green = rgb(0.06, 0.4, 0.13), grey = rgb(0.4, 0.4, 0.4), ink = rgb(0.1, 0.1, 0.1);
  const W = 595.28, M = 48;
  let y = 790;
  const text = (t: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f = o.b ? bold : font; const size = o.size || 10; const s = ascii(t);
    page.drawText(s, { x: o.right ? x - f.widthOfTextAtSize(s, size) : x, y: yy, size, font: f, color: o.color || ink });
  };
  const contact = getContact();
  text(site.name, M, y, { size: 18, b: true, color: green });
  text("INVOICE", W - M, y, { size: 18, b: true, right: true });
  y -= 18;
  text(site.url.replace(/^https?:\/\//, ""), M, y, { color: grey });
  text(inv.number, W - M, y, { b: true, right: true });
  y -= 14;
  if (contact.email) text(contact.email, M, y, { color: grey });
  text(`Issued ${inv.createdAt.slice(0, 10)}`, W - M, y, { right: true, color: grey });
  y -= 14;
  if (contact.whatsapp) text(`WhatsApp +${contact.whatsapp}`, M, y, { color: grey });
  text(`Order ${inv.order.number} placed ${String(inv.order.created_at).slice(0, 10)}`, W - M, y, { right: true, color: grey });
  y -= 30;
  const statusLabel = INVOICE_STATUS[inv.status].toUpperCase();
  const sc = inv.status === "paid" ? green : inv.status === "cancelled" ? grey : rgb(0.7, 0.35, 0);
  page.drawRectangle({ x: W - M - 110, y: y - 6, width: 110, height: 22, color: rgb(1, 1, 1), borderColor: sc, borderWidth: 1.2 });
  text(statusLabel, W - M - 110 + (110 - bold.widthOfTextAtSize(statusLabel, 11)) / 2, y, { b: true, size: 11, color: sc });
  text("Bill to", M, y, { b: true });
  y -= 15; text(inv.order.customer_name, M, y);
  y -= 13; text(`+${inv.order.phone}${inv.order.email ? "  ·  " + inv.order.email : ""}`, M, y, { color: grey });
  y -= 13; text(`${inv.order.address}, ${inv.order.city}, ${inv.order.state}`.slice(0, 95), M, y, { color: grey });
  y -= 30;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.93, 0.97, 0.93) });
  text("Item", M + 8, y, { b: true }); text("Qty", 360, y, { b: true, right: true }); text("Unit price", 450, y, { b: true, right: true }); text("Amount", W - M - 8, y, { b: true, right: true });
  y -= 22;
  for (const l of inv.lines) {
    text(`${l.name} (${l.label})`.slice(0, 55), M + 8, y); text(String(l.qty), 360, y, { right: true }); text(money(l.unitPrice), 450, y, { right: true }); text(money(l.lineTotal), W - M - 8, y, { right: true });
    y -= 12; text(`SKU ${l.sku}`, M + 8, y, { size: 8, color: grey }); y -= 14;
    if (y < 220) { y = 220; break; }
  }
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: grey });
  y -= 12;
  const row = (k: string, v: string, b = false) => { text(k, 380, y, { b, right: true, color: b ? ink : grey }); text(v, W - M - 8, y, { b, right: true }); y -= 16; };
  row("Products subtotal", money(inv.itemsSubtotal));
  if (inv.discount) row(`Discount${inv.couponCode ? ` (${inv.couponCode})` : ""}`, "−" + money(inv.discount));
  row("Delivery", inv.freeDelivery ? "FREE (₦0)" : inv.deliveryFee == null ? "To be confirmed" : money(inv.deliveryFee));
  row("Total", money(inv.total), true);
  row("Amount paid (verified)", money(inv.amountPaid));
  row("Balance due", money(inv.balance), true);
  y -= 10;
  text("Payment", M, y, { b: true }); y -= 14;
  if (inv.productPaidAt && inv.order.payment_status === "paid") { text(`Product payment verified on ${inv.productPaidAt.slice(0, 16)} UTC.`, M, y); y -= 13; }
  else { text(`Pay by bank transfer: ${inv.bank.bank}, ${inv.bank.accountName}, ${inv.bank.accountNumber}. Narration: ${inv.order.number}.`.slice(0, 110), M, y); y -= 13; }
  if (inv.bundledDelivery) { text("Delivery is included in the customer payment. WellnessXpressBrand settles the delivery agent.", M, y, { color: green }); y -= 13; }
  else if (!inv.freeDelivery && inv.deliveryFee) { text(inv.deliveryPaidAt ? `Delivery payment verified on ${inv.deliveryPaidAt.slice(0, 16)} UTC.` : "Delivery fee is payable separately.", M, y); y -= 13; }
  if (inv.freeDelivery) { text("Free delivery across Nigeria.", M, y, { color: green }); y -= 13; }
  text("A payment shows as paid only after we verify it in our bank account.", M, 60, { size: 8, color: grey });
  text(`${site.name} · ${site.url.replace(/^https?:\/\//, "")}`, W - M, 60, { size: 8, color: grey, right: true });
  return doc.save({ useObjectStreams: false });
}
