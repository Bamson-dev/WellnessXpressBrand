/*
 * Guide file format and quality gate. No imports, so the CI script can load this file directly with
 * `node --experimental-strip-types scripts/content-check.mjs`.
 *
 * A guide is a Markdown file with front matter between two "---" lines:
 *   title: ...                 (20 to 65 characters, used as the H1 and the page title)
 *   description: ...           (70 to 160 characters, the meta description)
 *   status: draft | published  (only "published" guides that pass every check go live)
 *   published: 2026-11-23      (first publication date)
 *   updated: 2026-11-23        (last meaningful update)
 *   cluster: bloating          (topic cluster id from docs/seo/topic-clusters.md)
 *   health: true               (health-related guides need a trusted public-health source and a "see a doctor" note)
 *   risk: low | high           (high = medical conditions, treatments, medicines or product effects: needs a named reviewer)
 *   reviewed: Name and role    (a real person who checked the facts; required before a high-risk guide can publish)
 *   keywords:                  (list) target search terms
 *   products:                  (list) product slugs this guide may link to
 *   sources:                   (list) "Source title | https://..." pairs
 */

export type Source = { title: string; url: string };
export type Guide = {
  slug: string; title: string; description: string; status: string; published: string; updated: string;
  cluster: string; health: boolean; risk: string; reviewed: string; keywords: string[]; products: string[]; sources: Source[]; body: string;
};

export function parseGuide(slug: string, raw: string): Guide {
  const text = raw.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const meta: Record<string, string | string[]> = {};
  if (m) {
    let key = "";
    for (const line of m[1].split("\n")) {
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (item && key) { const cur = meta[key]; meta[key] = [...(Array.isArray(cur) ? cur : []), item[1].trim()]; continue; }
      const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
      if (kv) { key = kv[1]; meta[key] = kv[2].trim() === "" ? [] : kv[2].trim(); }
    }
  }
  const s = (k: string) => (typeof meta[k] === "string" ? String(meta[k]) : "");
  const l = (k: string) => (Array.isArray(meta[k]) ? (meta[k] as string[]) : s(k) ? [s(k)] : []);
  return {
    slug, title: s("title"), description: s("description"), status: s("status") || "draft",
    published: s("published"), updated: s("updated") || s("published"), cluster: s("cluster"),
    health: s("health") === "true", risk: s("risk") || "high", reviewed: s("reviewed"), keywords: l("keywords"), products: l("products"),
    sources: l("sources").map((x) => { const [title, url] = x.split("|").map((y) => y.trim()); return { title: title || "", url: url || "" }; }),
    body: m ? m[2].trim() : text.trim(),
  };
}

/** Domains accepted as a trusted source for health statements. */
export const TRUSTED_HEALTH_DOMAINS = ["who.int", "nhs.uk", "cdc.gov", "nih.gov", "medlineplus.gov", "nafdac.gov.ng", "health.gov.ng", "fda.gov", "mayoclinic.org", "clevelandclinic.org"];

/** Claims a weight-management store must never publish without strong evidence. */
const RISKY_CLAIMS: [RegExp, string][] = [
  [/\bcures?\b|\bcured\b/i, "cure claim"],
  [/\bguarantee[sd]?\b/i, "guarantee"],
  [/clinically (proven|tested)|scientifically proven/i, "unsupported proof claim"],
  [/\bmiracle\b|\bmagic\b/i, "miracle claim"],
  [/\bmelts? (away )?(belly |body |stubborn )?fat\b|\bburns? belly fat\b|\bspot[- ]reduc/i, "fat-burning claim"],
  [/\bdetox(es|ify|ifies)? (your )?(body|liver|kidneys?|system)\b|\bflush(es)? (out )?toxins\b/i, "detox claim"],
  [/\blose \d+\s?(kg|kilos?|pounds|lbs?)\b.*\b(in|within) \d+\s?(days?|weeks?)\b/i, "rapid weight-loss promise"],
  [/\bno side effects\b|\b100% (safe|natural)\b|\bcompletely safe\b/i, "safety absolute"],
  [/\b(NAFDAC|FDA)[- ]approved\b|\bdoctor[- ]recommended\b/i, "approval or endorsement claim"],
  [/\bTODO\b|\bTBD\b|\[citation needed\]|\?\?\?/, "unresolved placeholder"],
];

const wordCount = (t: string) => t.replace(/[#>*_[\]()-]/g, " ").split(/\s+/).filter(Boolean).length;

export function checkGuide(g: Guide) {
  const errors: string[] = []; const warnings: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) errors.push("file name must be a lowercase-hyphen slug");
  if (g.title.length < 20 || g.title.length > 65) errors.push(`title is ${g.title.length} characters (20 to 65)`);
  if (g.description.length < 70 || g.description.length > 160) errors.push(`description is ${g.description.length} characters (70 to 160)`);
  if (!["draft", "published"].includes(g.status)) errors.push(`unknown status "${g.status}"`);
  if (g.status === "published" && !/^\d{4}-\d{2}-\d{2}$/.test(g.published)) errors.push("published guides need a published date (YYYY-MM-DD)");
  if (g.updated && g.published && g.updated < g.published) errors.push("updated date is before the published date");
  if (!g.cluster) warnings.push("no topic cluster");
  if (!g.keywords.length) warnings.push("no target keywords");
  const goodSources = g.sources.filter((s) => s.title && /^https:\/\/[^\s]+$/.test(s.url));
  if (goodSources.length < 2) errors.push("needs at least 2 sources written as \"Title | https://...\"");
  if (g.sources.length !== goodSources.length) errors.push("every source needs a title and an https address");
  if (g.health) {
    const trusted = goodSources.some((s) => TRUSTED_HEALTH_DOMAINS.some((d) => new URL(s.url).hostname === d || new URL(s.url).hostname.endsWith("." + d)));
    if (!trusted) errors.push(`health guides need at least one source from: ${TRUSTED_HEALTH_DOMAINS.join(", ")}`);
    if (!["low", "high"].includes(g.risk)) errors.push(`unknown risk "${g.risk}" (low or high)`);
    if (g.status === "published" && g.risk !== "low" && !g.reviewed) errors.push("high-risk health guides need a named reviewer before they can publish");
    if (!/\b(doctor|GP|pharmacist|health professional|clinic|hospital)\b/i.test(g.body)) errors.push("health guides must say when to see a doctor or health professional");
  }
  const words = wordCount(g.body);
  if (words < 600) errors.push(`body is ${words} words (minimum 600)`);
  if (/^#\s/m.test(g.body)) errors.push("do not use a level-1 heading in the body (the title is the H1)");
  if (!/^##\s/m.test(g.body)) warnings.push("no section headings");
  for (const [re, label] of RISKY_CLAIMS) {
    const hit = re.exec(g.body) || re.exec(g.title) || re.exec(g.description);
    if (hit) errors.push(`${label}: "${hit[0]}"`);
  }
  for (const link of g.body.matchAll(/\]\(([^)]+)\)/g)) {
    const href = link[1];
    if (!/^(\/[a-z0-9\-/]*|https:\/\/[^\s]+)$/.test(href)) errors.push(`bad link "${href}"`);
    const p = /^\/product\/([a-z0-9-]+)/.exec(href);
    if (p && !g.products.includes(p[1])) errors.push(`links to /product/${p[1]} but it is not listed under products`);
  }
  return { errors, warnings, words };
}
