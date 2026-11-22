import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { db, DATA_DIR, PRODUCT_IMG_DIR } from "@/lib/db";
import { sniffType } from "@/lib/validate";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export type Media = { id: number; url: string; file: string; originalName: string; mime: string; bytes: number; alt: string; caption: string; builtin: boolean; createdAt: string };
const map = (r: Record<string, unknown>): Media => ({
  id: Number(r.id), url: String(r.url), file: String(r.file), originalName: String(r.original_name), mime: String(r.mime), bytes: Number(r.bytes),
  alt: String(r.alt), caption: String(r.caption), builtin: Number(r.builtin) === 1, createdAt: String(r.created_at),
});

/**
 * Saves an uploaded image to the persistent volume. The type is detected from the file's bytes, not its name or the
 * browser's claimed type. The stored name is random, so user input never becomes part of a path.
 */
export async function saveImageUpload(file: File, actor: string): Promise<{ media?: Media; error?: string }> {
  if (!file || !file.size) return { error: "Choose an image to upload." };
  if (file.size > MAX_IMAGE_BYTES) return { error: `${file.name || "The image"} is larger than 6 MB.` };
  let fullPath = "";
  let url = "";
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniffType(buf);
    if (!type || type === "pdf") return { error: `${file.name || "That file"} is not a JPG, PNG or WebP image.` };
    const name = `${randomBytes(12).toString("hex")}.${type}`;
    await fs.mkdir(PRODUCT_IMG_DIR, { recursive: true });
    fullPath = path.join(PRODUCT_IMG_DIR, name);
    url = `/product-images/${name}`;
    const original = (file.name || "").replace(/[^\w. -]+/g, "").slice(0, 120);
    const alt = original.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 150);
    await fs.writeFile(fullPath, buf, { flag: "wx" });
    db().prepare("INSERT INTO media (url, file, original_name, mime, bytes, alt, uploaded_by) VALUES (?,?,?,?,?,?,?)").run(url, "product-images/" + name, original, MIME[type], buf.length, alt, actor);
    const media = getMediaByUrl(url);
    if (!media) throw new Error("Uploaded file record could not be loaded.");
    return { media };
  } catch (error) {
    if (url) db().prepare("DELETE FROM media WHERE url = ?").run(url);
    if (fullPath) await fs.unlink(fullPath).catch(() => {});
    console.error("Image upload storage failed:", error);
    return { error: "Image upload could not be saved. Check available storage and try again." };
  }
}
export function listMedia(q = "") {
  const like = "%" + q.replace(/[%_]/g, "") + "%";
  return db().prepare("SELECT * FROM media WHERE (? = '' OR url LIKE ? OR original_name LIKE ? OR alt LIKE ?) ORDER BY id DESC LIMIT 500").all(q, like, like, like).map(map);
}
export function getMedia(id: number) {
  const r = db().prepare("SELECT * FROM media WHERE id = ?").get(id);
  return r ? map(r) : null;
}
export function getMediaByUrl(url: string) {
  const r = db().prepare("SELECT * FROM media WHERE url = ?").get(url);
  return r ? map(r) : null;
}
export function mediaMeta(urls: string[]) {
  const out: Record<string, { alt: string; caption: string }> = {};
  for (const u of urls) {
    const m = getMediaByUrl(u);
    if (m) out[u] = { alt: m.alt, caption: m.caption };
  }
  return out;
}

/** Where an image is used: products (any status, so archived products keep working) and categories. */
export function mediaReferences(url: string) {
  const products = db().prepare("SELECT id, name, status FROM products WHERE images LIKE ?").all(`%"${url.replace(/[%_]/g, "")}"%`)
    .map((r) => ({ id: Number(r.id), name: String(r.name), status: String(r.status) }));
  const categories = db().prepare("SELECT id, name FROM categories WHERE image = ?").all(url).map((r) => ({ id: Number(r.id), name: String(r.name) }));
  const banners = db().prepare("SELECT id, heading FROM banners WHERE desktop_image = ? OR mobile_image = ?").all(url, url).map((r) => ({ id: Number(r.id), name: String(r.heading || `Banner #${r.id}`) }));
  const seo = db().prepare("SELECT id, name FROM products WHERE og_image = ?").all(url).map((r) => ({ id: Number(r.id), name: `${String(r.name)} (sharing image)` }));
  const site = String(db().prepare("SELECT value FROM settings WHERE key = 'seo'").get()?.value || "").includes(`"${url}"`) ? [{ id: 0, name: "Site sharing image" }] : [];
  return { products: [...products, ...seo], categories, banners: [...banners, ...site], count: products.length + categories.length + banners.length + seo.length + site.length };
}

/** Deletes an uploaded image only when nothing uses it. Built-in store images cannot be deleted here. */
export async function deleteMedia(id: number): Promise<string | null> {
  const m = getMedia(id);
  if (!m) return "Image not found.";
  if (m.builtin || !m.file) return "This is a built-in store image. It can be removed from products, but not deleted.";
  const refs = mediaReferences(m.url);
  if (refs.count) return `This image is still used by: ${[...refs.products.map((p) => p.name), ...refs.categories.map((c) => `${c.name} (category)`)].join(", ")}. Remove it there first.`;
  const full = path.resolve(DATA_DIR, m.file);
  if (!full.startsWith(path.resolve(DATA_DIR) + path.sep)) return "Invalid file path.";
  await fs.unlink(full).catch(() => {});
  db().prepare("DELETE FROM media WHERE id = ?").run(id);
  return null;
}
