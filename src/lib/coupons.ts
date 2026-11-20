import "server-only";
import { db } from "@/lib/db";
import type { DB } from "@/lib/db";

export type CouponLine = { productId: number; variantId?: number; lineTotal: number };
export type CouponResult = { ok: true; code: string; discountAmount: number; eligibleSubtotal: number; eligibleVariantIds: number[] } | { ok: false; error: string };
const parseIds = (value: unknown): number[] => { try { const v = JSON.parse(String(value || "[]")); return Array.isArray(v) ? v.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) : []; } catch { return []; } };
const parseSlugs = (value: unknown): string[] => { try { const v = JSON.parse(String(value || "[]")); return Array.isArray(v) ? v.map(String).filter((x) => /^[a-z0-9-]{1,70}$/.test(x)) : []; } catch { return []; } };

export function validateCoupon(codeInput: unknown, lines: CouponLine[], customerKey = "", connection: DB = db(), now = new Date()): CouponResult {
  const code = String(codeInput || "").trim().toUpperCase().slice(0, 40);
  if (!code) return { ok: false, error: "Enter a coupon code." };
  const coupon = connection.prepare("SELECT * FROM coupons WHERE code=?").get(code);
  if (!coupon || Number(coupon.active) !== 1) return { ok: false, error: "That coupon is not available." };
  const today = now.toISOString().slice(0, 10);
  const startsAt = String(coupon.starts_at || "");
  const expiresAt = String(coupon.expires_at || "");
  if (startsAt && today < startsAt) return { ok: false, error: "That coupon is not active yet." };
  if (expiresAt && today > expiresAt) return { ok: false, error: "That coupon has expired." };
  const used = Number(connection.prepare("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=?").get(coupon.id)?.n || 0);
  if (coupon.usage_limit != null && used >= Number(coupon.usage_limit)) return { ok: false, error: "That coupon has reached its usage limit." };
  if (customerKey && Number(coupon.customer_limit) > 0) {
    const customerUsed = Number(connection.prepare("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=? AND customer_key=?").get(coupon.id, customerKey)?.n || 0);
    if (customerUsed >= Number(coupon.customer_limit)) return { ok: false, error: "You have already used that coupon the allowed number of times." };
  }
  const productIds = parseIds(coupon.product_ids);
  const categorySlugs = parseSlugs(coupon.category_slugs);
  let eligible = lines;
  if (productIds.length || categorySlugs.length) {
    eligible = lines.filter((line) => {
      if (productIds.includes(line.productId)) return true;
      if (categorySlugs.length) return categorySlugs.includes(String(connection.prepare("SELECT category FROM products WHERE id=?").get(line.productId)?.category || ""));
      return false;
    });
  }
  const eligibleSubtotal = eligible.reduce((sum, line) => sum + Math.max(0, Math.floor(line.lineTotal)), 0);
  if (!eligibleSubtotal) return { ok: false, error: "This coupon does not apply to the items in your cart." };
  const orderTotal = lines.reduce((sum, line) => sum + Math.max(0, Math.floor(line.lineTotal)), 0);
  if (orderTotal < Number(coupon.minimum_order || 0)) return { ok: false, error: `Your product subtotal must be at least ₦${Number(coupon.minimum_order).toLocaleString("en-NG")} to use this coupon.` };
  const value = Number(coupon.discount_value);
  const discountAmount = coupon.discount_type === "percent" ? Math.floor(eligibleSubtotal * Math.min(100, value) / 100) : Math.min(eligibleSubtotal, value);
  if (discountAmount < 1) return { ok: false, error: "This coupon does not discount the items in your cart." };
  if (discountAmount >= orderTotal) return { ok: false, error: "The coupon cannot reduce the product payment to zero. Use a smaller discount." };
  return { ok: true, code, discountAmount, eligibleSubtotal, eligibleVariantIds: eligible.map((line) => Number(line.variantId || 0)).filter((id) => id > 0) };
}
