import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export type SeoSettings = { titleTemplate: string; homeTitle: string; homeDescription: string; defaultDescription: string; ogImage: string; noindexSite: boolean };
export const getSeo = () => getSetting<SeoSettings>("seo");

export const TITLE_MAX = 60;
export const DESC_MAX = 160;

/** Paths an admin may redirect FROM: a clean site path that is not an admin, API or system path. */
export const validFromPath = (p: string) => /^\/[a-z0-9][a-z0-9\-/._]*$/i.test(p) && !/^\/(admin|api|_next|media|product-images|order)(\/|$)/i.test(p) && !p.includes("//") && p.length <= 200;
/** Redirect targets: a site path or an https address. */
export const validToPath = (p: string) => (/^\/[a-z0-9\-/._?=&#]*$/i.test(p) && !p.startsWith("//")) || /^https:\/\/[\w.-]+(\/[\w\-./?=&#%]*)?$/.test(p);

/** Follows saved redirects at most 5 hops; returns the final target or null, refusing loops. */
export function resolveRedirect(path: string): string | null {
  let cur = path; const seen = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const r = db().prepare("SELECT to_path FROM redirects WHERE from_path = ?").get(cur);
    if (!r) break;
    if (seen.has(cur)) return null;
    seen.add(cur); cur = String(r.to_path);
    if (!cur.startsWith("/")) break;
  }
  return cur === path ? null : cur;
}

/** SEO problems customers and search engines would notice: missing, too long, or duplicated titles and descriptions. */
export function seoIssues() {
  const issues: { where: string; href: string; problem: string }[] = [];
  const products = db().prepare("SELECT id, name, slug, seo_title, meta_description, short_description, status, noindex FROM products WHERE status = 'published'").all();
  const cats = db().prepare("SELECT id, name, slug, seo_title, meta_description, description, status, noindex FROM categories WHERE status = 'published'").all();
  const titles = new Map<string, string[]>(); const descs = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, w: string) => { if (k) m.set(k.toLowerCase(), [...(m.get(k.toLowerCase()) || []), w]); };
  for (const p of products) {
    const where = `Product: ${p.name}`; const title = String(p.seo_title || p.name); const desc = String(p.meta_description || "");
    if (!p.meta_description) issues.push({ where, href: `/admin/seo#p-${p.id}`, problem: "No meta description (the short description is used instead)." });
    if (title.length > TITLE_MAX) issues.push({ where, href: `/admin/seo#p-${p.id}`, problem: `Title is ${title.length} characters; search results show about ${TITLE_MAX}.` });
    if (desc.length > DESC_MAX) issues.push({ where, href: `/admin/seo#p-${p.id}`, problem: `Description is ${desc.length} characters; keep it under ${DESC_MAX}.` });
    add(titles, title, where); add(descs, desc, where);
  }
  for (const c of cats) {
    const where = `Category: ${c.name}`; const title = String(c.seo_title || c.name); const desc = String(c.meta_description || c.description || "");
    if (!c.meta_description) issues.push({ where, href: `/admin/seo#c-${c.id}`, problem: "No meta description (the category description is used instead)." });
    if (title.length > TITLE_MAX) issues.push({ where, href: `/admin/seo#c-${c.id}`, problem: `Title is ${title.length} characters.` });
    add(titles, title, where); add(descs, desc, where);
  }
  const site = getSeo();
  if ((site.homeDescription || "").length > DESC_MAX) issues.push({ where: "Homepage", href: "/admin/seo", problem: `Description is ${site.homeDescription.length} characters; keep it under ${DESC_MAX}.` });
  if ((site.homeTitle || "").length > TITLE_MAX) issues.push({ where: "Homepage", href: "/admin/seo", problem: `Title is ${site.homeTitle.length} characters; search results show about ${TITLE_MAX}.` });
  for (const [t, w] of titles) if (w.length > 1) issues.push({ where: w.join(", "), href: "/admin/seo", problem: `Same title used more than once: "${t}".` });
  for (const [d, w] of descs) if (w.length > 1) issues.push({ where: w.join(", "), href: "/admin/seo", problem: `Same description used more than once: "${d.slice(0, 60)}…".` });
  return issues;
}
