import "server-only";
import fs from "fs";
import path from "path";
import { checkGuide, parseGuide, type Guide } from "@/lib/guide-format";

/**
 * Editorial guides live as Markdown files in content/guides. A guide is public only when its front matter says
 * `status: published` and it passes the same quality gate that CI runs (scripts/content-check.mjs).
 * Drafts and guides that fail the gate never render and never enter the sitemap.
 */
const DIR = path.join(process.cwd(), "content", "guides");

let cache: { at: number; guides: Guide[] } | null = null;

function load(): Guide[] {
  if (cache && Date.now() - cache.at < 60_000) return cache.guides;
  let files: string[] = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")); } catch { files = []; }
  const guides = files.map((f) => parseGuide(f.replace(/\.md$/, ""), fs.readFileSync(path.join(DIR, f), "utf8")));
  cache = { at: Date.now(), guides };
  return guides;
}

/** Guides that are published and pass every quality check, newest first. */
export function publishedGuides(): Guide[] {
  return load()
    .filter((g) => g.status === "published" && checkGuide(g).errors.length === 0)
    .sort((a, b) => b.published.localeCompare(a.published));
}

export const getGuide = (slug: string) => publishedGuides().find((g) => g.slug === slug) || null;

/**
 * Guides for the "Helpful guides" block on a product page: guides that list this product first, then the newest
 * general guides. Listing a guide here never implies the product has a health effect.
 */
export function guidesForProduct(slug: string) {
  const all = publishedGuides();
  const own = all.filter((g) => g.products.includes(slug));
  return [...own, ...all.filter((g) => !own.includes(g) && g.products.length === 0)];
}
