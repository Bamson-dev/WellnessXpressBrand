import "server-only";
import { db } from "@/lib/db";

export type Variant = {
  id: number; productId: number; label: string; size: string; duration: string; sku: string;
  price: number; salePrice: number | null; stock: number | null; status: string; needsConfirmation: boolean;
  priceSource: string; sort: number;
};
export type ComboItem = { id: number; itemProductId: number | null; itemName: string; sizeNote: string; quantityNote: string; itemSlug: string | null; itemImage: string | null };
export type Faq = { q: string; a: string };
export type Product = {
  id: number; slug: string; name: string; type: "single" | "combo"; category: string; shortDescription: string;
  description: string; information: string; ingredients: string; directions: string; faqs: Faq[]; images: string[];
  related: string[]; status: string; featured: boolean; sort: number; reviewNote: string; createdAt: string; updatedAt: string;
  seoTitle: string; metaDescription: string; ogImage: string; noindex: boolean;
  variants: Variant[]; items: ComboItem[];
};

export type Category = { id: number; slug: string; name: string; description: string; image: string; seoTitle: string; metaDescription: string; status: "published" | "hidden"; sort: number; productCount: number; noindex: boolean };

export function getCategories(includeHidden = false): Category[] {
  const where = includeHidden ? "" : "WHERE c.status = 'published'";
  return db().prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category = c.slug) product_count
    FROM categories c ${where} ORDER BY c.sort,c.id`).all().map((r) => ({
    id: Number(r.id), slug: String(r.slug), name: String(r.name), description: String(r.description), image: String(r.image),
    seoTitle: String(r.seo_title), metaDescription: String(r.meta_description), status: r.status as "published" | "hidden", noindex: Number(r.noindex || 0) === 1,
    sort: Number(r.sort), productCount: Number(r.product_count),
  }));
}

export function getCategoryRedirect(slug: string): string | null {
  const row = db().prepare("SELECT new_slug FROM category_redirects WHERE old_slug = ?").get(slug);
  return row ? String(row.new_slug) : null;
}

const parse = <T,>(s: unknown, d: T): T => {
  try { return JSON.parse(String(s)) as T; } catch { return d; }
};

function parseStringArray(value: unknown): string[] {
  const parsed = parse<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function mapVariant(r: Record<string, unknown>): Variant {
  return {
    id: Number(r.id), productId: Number(r.product_id), label: String(r.label), size: String(r.size), duration: String(r.duration),
    sku: String(r.sku), price: Number(r.price), salePrice: r.sale_price == null ? null : Number(r.sale_price),
    stock: r.stock == null ? null : Number(r.stock), status: String(r.status), needsConfirmation: Number(r.needs_confirmation) === 1,
    priceSource: String(r.price_source), sort: Number(r.sort),
  };
}

function mapProduct(r: Record<string, unknown>, opts: { allVariants?: boolean } = {}): Product {
  const id = Number(r.id);
  const vq = opts.allVariants
    ? "SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id"
    : "SELECT * FROM variants WHERE product_id = ? AND status = 'active' ORDER BY sort, id";
  const variants = db().prepare(vq).all(id).map(mapVariant);
  const items = db()
    .prepare(
      `SELECT c.*, p.slug item_slug, p.images item_images, p.status item_status FROM combo_items c
       LEFT JOIN products p ON p.id = c.item_product_id WHERE c.combo_id = ? ORDER BY c.sort, c.id`
    )
    .all(id)
    .map((c) => ({
      id: Number(c.id), itemProductId: c.item_product_id == null ? null : Number(c.item_product_id), itemName: String(c.item_name),
      sizeNote: String(c.size_note), quantityNote: String(c.quantity_note),
      itemSlug: c.item_status === "published" ? String(c.item_slug) : null,
      itemImage: parse<string[]>(c.item_images, [])[0] || null,
    }));
  return {
    id, slug: String(r.slug), name: String(r.name), type: r.type as "single" | "combo", category: String(r.category),
    shortDescription: String(r.short_description), description: String(r.description), information: String(r.information),
    ingredients: String(r.ingredients), directions: String(r.directions), faqs: parse<Faq[]>(r.faqs, []).filter((f) => f && typeof f.q === "string" && typeof f.a === "string"), images: parseStringArray(r.images),
    related: parseStringArray(r.related), status: String(r.status), featured: Number(r.featured) === 1, sort: Number(r.sort),
    reviewNote: String(r.review_note), createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    seoTitle: String(r.seo_title || ""), metaDescription: String(r.meta_description || ""), ogImage: String(r.og_image || ""), noindex: Number(r.noindex || 0) === 1, variants, items,
  };
}

export const effective = (v: Variant) => (v.salePrice != null && v.salePrice < v.price ? v.salePrice : v.price);
export const inStock = (v: Variant) => v.stock == null || v.stock > 0;
export const purchasable = (p: Product) => p.status === "published" && p.variants.some(inStock);
export function priceRange(p: Product) {
  const ps = p.variants.map(effective);
  return ps.length ? { min: Math.min(...ps), max: Math.max(...ps) } : null;
}

export type ShopQuery = { category?: string; q?: string; sort?: string; featured?: boolean; page?: number; perPage?: number };

export function listProducts(qy: ShopQuery = {}) {
  const where = ["status = 'published'"];
  const params: unknown[] = [];
  where.push("category IN (SELECT slug FROM categories WHERE status = 'published')");
  if (qy.category) { where.push("category = ?"); params.push(qy.category); }
  if (qy.featured) where.push("featured = 1");
  if (qy.q) {
    where.push("(name LIKE ? OR short_description LIKE ?)");
    const like = "%" + qy.q.replace(/[%_]/g, "") + "%";
    params.push(like, like);
  }
  let rows = db().prepare(`SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY sort, id`).all(...params).map((r) => mapProduct(r));
  rows = rows.filter((p) => p.variants.length > 0);
  const min = (p: Product) => priceRange(p)?.min ?? 0;
  if (qy.sort === "price-asc") rows.sort((a, b) => min(a) - min(b));
  else if (qy.sort === "price-desc") rows.sort((a, b) => min(b) - min(a));
  else if (qy.sort === "newest") rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  else if (qy.sort === "featured") rows.sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort);
  const total = rows.length;
  const perPage = qy.perPage || 12;
  const page = Math.max(1, qy.page || 1);
  return { items: rows.slice((page - 1) * perPage, page * perPage), total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export function getProduct(slug: string, opts: { includeUnpublished?: boolean } = {}) {
  const r = db().prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  if (!r) return null;
  if (!opts.includeUnpublished && r.status !== "published") return null;
  return mapProduct(r, { allVariants: opts.includeUnpublished });
}

export function getProductById(id: number) {
  const r = db().prepare("SELECT * FROM products WHERE id = ?").get(id);
  return r ? mapProduct(r, { allVariants: true }) : null;
}

export function allProductsAdmin() {
  return db().prepare("SELECT * FROM products ORDER BY CASE status WHEN 'archived' THEN 1 ELSE 0 END, sort, id").all().map((r) => mapProduct(r, { allVariants: true }));
}

export function relatedProducts(p: Product, limit = 4) {
  const bySlug = p.related.map((s) => getProduct(s)).filter((x): x is Product => !!x && x.variants.length > 0);
  if (bySlug.length >= limit) return bySlug.slice(0, limit);
  const more = listProducts({ category: p.category, perPage: 50 }).items.filter((x) => x.id !== p.id && !bySlug.some((b) => b.id === x.id));
  const fill = more.length ? more : listProducts({ perPage: 50 }).items.filter((x) => x.id !== p.id);
  return [...bySlug, ...fill].slice(0, limit);
}

/** Server-side quote for cart lines. Prices always come from the database, never from the browser. */
export function quoteLines(lines: { variantId: number; qty: number }[]) {
  const out: { variantId: number; productId: number; slug: string; name: string; label: string; sku: string; image: string | null; unitPrice: number; qty: number; lineTotal: number; available: boolean; reason?: string }[] = [];
  for (const l of lines.slice(0, 50)) {
    const vid = Number(l.variantId);
    const qty = Number(l.qty);
    const v = db().prepare("SELECT v.*, p.slug, p.name pname, p.images, p.status pstatus FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?").get(vid);
    if (!v) continue;
    const variant = mapVariant(v);
    let available = true;
    let reason: string | undefined;
    if (v.pstatus !== "published" || variant.status !== "active") { available = false; reason = "No longer available"; }
    else if (!inStock(variant)) { available = false; reason = "Out of stock"; }
    else if (variant.stock != null && qty > variant.stock) { available = false; reason = `Only ${variant.stock} left`; }
    const okQty = Number.isInteger(qty) && qty >= 1 && qty <= 20;
    if (!okQty) { available = false; reason = "Quantity must be between 1 and 20"; }
    const unit = effective(variant);
    out.push({
      variantId: vid, productId: variant.productId, slug: String(v.slug), name: String(v.pname), label: variant.label, sku: variant.sku,
      image: parse<string[]>(v.images, [])[0] || null, unitPrice: unit, qty: okQty ? qty : 1, lineTotal: unit * (okQty ? qty : 1), available, reason,
    });
  }
  return out;
}
