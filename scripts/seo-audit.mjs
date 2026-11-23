#!/usr/bin/env node
/*
 * Live SEO audit and monitor for WellnessXpressBrand. Read-only: it only sends GET requests.
 *   node scripts/seo-audit.mjs [https://wellnessxpressbrand.com] [--json out.json] [--md out.md]
 * Checks robots.txt, the sitemap, every sitemap URL (status, title, description, canonical, H1, robots meta,
 * Open Graph, JSON-LD validity and required Product fields, image alt text), internal links (broken links and
 * orphan pages), duplicate titles and descriptions, the Merchant Center feed, llms.txt and response times.
 * Exit code: 2 when a CRITICAL or HIGH issue is found, otherwise 0.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || process.env.SEO_BASE || "https://wellnessxpressbrand.com").replace(/\/$/, "");
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : "");
const UA = "WellnessXpressSEOMonitor/1.0 (+https://wellnessxpressbrand.com)";
const RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const issues = [];
const add = (severity, where, problem) => issues.push({ severity, where, problem });
const MUST_BE_PUBLIC = ["/", "/shop"];

async function get(url, { method = "GET", timeout = 20000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html,application/xml,*/*" }, signal: AbortSignal.timeout(timeout) });
    const body = method === "HEAD" ? "" : await r.text();
    return { status: r.status, headers: r.headers, body, ms: Date.now() - t0, location: r.headers.get("location") || "" };
  } catch (e) {
    return { status: 0, headers: new Headers(), body: "", ms: Date.now() - t0, error: String(e?.message || e) };
  }
}

const attr = (tag, name) => (new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag) || [])[1];
const metaContent = (html, key, val) => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) if ((attr(m[0], key) || "").toLowerCase() === val) return attr(m[0], "content") ?? "";
  return null;
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

function parsePage(html) {
  const title = decode(((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").trim());
  const description = metaContent(html, "name", "description");
  const robots = metaContent(html, "name", "robots") || "";
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel="canonical"/i.test(t));
  const canonical = canonicalTag ? attr(canonicalTag, "href") : null;
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const ogImage = metaContent(html, "property", "og:image");
  const ld = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try { return JSON.parse(m[1]); } catch { return { __invalid: true }; }
  }).flatMap((x) => (Array.isArray(x) ? x : [x]));
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => !/\balt=/i.test(t)).length;
  const links = [...html.matchAll(/<a\b[^>]*href="([^"#]+)"/gi)].map((m) => decode(m[1]));
  return { title, description, robots, canonical, h1, ogImage, ld, imgCount: imgs.length, noAlt, links };
}

const started = Date.now();
const pages = new Map();

// 1. Availability
const home = await get(`${BASE}/`);
if (home.status !== 200) add("CRITICAL", "/", `Homepage returned ${home.status || home.error}`);
else if (home.ms > 3000) add("MEDIUM", "/", `Homepage took ${home.ms} ms to respond`);

// 2. robots.txt
const robots = await get(`${BASE}/robots.txt`);
let disallows = [];
if (robots.status !== 200) add("CRITICAL", "/robots.txt", `robots.txt returned ${robots.status || robots.error}`);
else {
  const groups = robots.body.split(/\n(?=user-agent:)/i);
  const star = groups.find((g) => /user-agent:\s*\*/i.test(g)) || "";
  disallows = [...star.matchAll(/^disallow:\s*(\S*)/gim)].map((m) => m[1]).filter(Boolean);
  if (disallows.includes("/")) add("CRITICAL", "/robots.txt", "robots.txt blocks the whole site (Disallow: /)");
  for (const p of MUST_BE_PUBLIC) if (disallows.some((d) => p.startsWith(d) && d !== "")) add("CRITICAL", "/robots.txt", `robots.txt blocks ${p}`);
  if (!/sitemap:\s*https?:\/\//i.test(robots.body)) add("HIGH", "/robots.txt", "robots.txt does not list the sitemap");
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot"]) {
    const g = groups.find((x) => new RegExp(`user-agent:\\s*${bot}\\b`, "i").test(x));
    if (g && /^disallow:\s*\/\s*$/im.test(g)) add("HIGH", "/robots.txt", `robots.txt blocks ${bot}`);
  }
}
const blocked = (p) => disallows.some((d) => p.startsWith(d));

// 3. Sitemap
const sm = await get(`${BASE}/sitemap.xml`);
let urls = [];
if (sm.status !== 200) add("CRITICAL", "/sitemap.xml", `Sitemap returned ${sm.status || sm.error}`);
else {
  if (!/^<\?xml/.test(sm.body.trim()) || !/<urlset/.test(sm.body)) add("CRITICAL", "/sitemap.xml", "Sitemap is not valid sitemap XML");
  urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1])).filter((u) => !/\.(png|jpe?g|webp|gif)$/i.test(u));
  const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dupes.length) add("MEDIUM", "/sitemap.xml", `Duplicate sitemap entries: ${[...new Set(dupes)].join(", ")}`);
  for (const u of urls) {
    const p = new URL(u);
    if (`${p.protocol}//${p.host}` !== BASE) add("HIGH", "/sitemap.xml", `Sitemap URL on the wrong host: ${u}`);
    if (/^\/(admin|api|cart|checkout|order)(\/|$)/.test(p.pathname) || p.search) add("HIGH", "/sitemap.xml", `Sitemap lists a private or filtered URL: ${u}`);
    if (blocked(p.pathname)) add("HIGH", "/sitemap.xml", `Sitemap lists a URL that robots.txt blocks: ${u}`);
  }
  if (!urls.some((u) => /\/product\//.test(u))) add("HIGH", "/sitemap.xml", "Sitemap has no product pages");
}

// 4. Every sitemap page
const queue = [...urls];
const conc = 4;
await Promise.all(Array.from({ length: conc }, async () => {
  while (queue.length) {
    const u = queue.shift();
    const path = new URL(u).pathname;
    const r = await get(u);
    const info = { url: u, path, status: r.status, ms: r.ms };
    pages.set(path, info);
    const isProduct = path.startsWith("/product/");
    if (r.status >= 300 && r.status < 400) { add("HIGH", path, `Sitemap URL redirects (${r.status} to ${r.location})`); continue; }
    if (r.status !== 200) { add(isProduct || path === "/" ? "CRITICAL" : "HIGH", path, `Returned ${r.status || r.error}`); continue; }
    const xr = r.headers.get("x-robots-tag") || "";
    const pg = parsePage(r.body);
    Object.assign(info, { title: pg.title, description: pg.description, h1: pg.h1, links: pg.links, ld: pg.ld.map((x) => x["@type"]).join("+") });
    if (/noindex/i.test(pg.robots) || /noindex/i.test(xr)) add(isProduct ? "CRITICAL" : "HIGH", path, "Page in the sitemap is set to noindex");
    if (!pg.title) add("MEDIUM", path, "Missing title");
    else if (pg.title.length > 65) add("LOW", path, `Title is ${pg.title.length} characters: "${pg.title}"`);
    if (pg.description == null || !pg.description.trim()) add("MEDIUM", path, "Missing meta description");
    else if (pg.description.length > 165) add("LOW", path, `Meta description is ${pg.description.length} characters`);
    else if (pg.description.length < 50) add("LOW", path, `Meta description is only ${pg.description.length} characters`);
    if (!pg.canonical) add("MEDIUM", path, "Missing canonical link");
    else if (pg.canonical.replace(/\/$/, "") !== u.replace(/\/$/, "")) add("HIGH", path, `Canonical points elsewhere: ${pg.canonical}`);
    if (pg.h1 !== 1) add("MEDIUM", path, `Page has ${pg.h1} H1 headings`);
    if (!pg.ogImage) add("LOW", path, "Missing og:image");
    if (pg.noAlt) add("MEDIUM", path, `${pg.noAlt} image(s) without alt text`);
    if (pg.ld.some((x) => x.__invalid)) add("HIGH", path, "Invalid JSON-LD");
    if (isProduct) {
      const prod = pg.ld.find((x) => x["@type"] === "Product");
      if (!prod) add("HIGH", path, "No Product structured data");
      else {
        const offers = Array.isArray(prod.offers) ? prod.offers : prod.offers ? [prod.offers] : [];
        if (!prod.name || !prod.image || !offers.length) add("HIGH", path, "Product structured data is missing name, image or offers");
        for (const o of offers) if (o.price == null && o.lowPrice == null) add("HIGH", path, "Offer without a price");
        if (prod.aggregateRating && !(Number(prod.aggregateRating.reviewCount) > 0)) add("HIGH", path, "aggregateRating without reviews");
      }
      if (!pg.ld.some((x) => x["@type"] === "BreadcrumbList")) add("LOW", path, "No breadcrumb structured data");
    }
    if (r.ms > 3000) add("MEDIUM", path, `Slow response: ${r.ms} ms`);
  }
}));

// 5. Duplicates
const dup = (key) => {
  const m = new Map();
  for (const p of pages.values()) if (p[key]) m.set(p[key], [...(m.get(p[key]) || []), p.path]);
  for (const [v, ps] of m) if (ps.length > 1) add("MEDIUM", ps.join(", "), `Same ${key} on ${ps.length} pages: "${String(v).slice(0, 80)}"`);
};
dup("title"); dup("description");

// 6. Internal links: broken links and orphans
const inbound = new Map([...pages.keys()].map((p) => [p, 0]));
const internal = new Set();
for (const p of pages.values()) for (const href of p.links || []) {
  let url; try { url = new URL(href, BASE); } catch { continue; }
  if (`${url.protocol}//${url.host}` !== BASE) continue;
  const path = url.pathname;
  if (/^\/(api|_next|admin|media|product-images|images|brand)\//.test(path) || url.search) continue;
  internal.add(path);
  if (inbound.has(path) && path !== p.path) inbound.set(path, inbound.get(path) + 1);
}
for (const path of internal) {
  if (pages.has(path) || ["/cart", "/checkout"].includes(path)) continue;
  const r = await get(BASE + path, { method: "GET" });
  if (r.status === 404 || r.status >= 500 || r.status === 0) add("MEDIUM", path, `Broken internal link (${r.status || r.error})`);
}
for (const [path, n] of inbound) if (n === 0 && path !== "/") add("MEDIUM", path, "Orphan page: no internal links point to it");

// 7. Feed and llms.txt
const feed = await get(`${BASE}/feeds/google-merchant.xml`);
let feedItems = 0;
if (feed.status !== 200) add("HIGH", "/feeds/google-merchant.xml", `Merchant feed returned ${feed.status || feed.error}`);
else {
  feedItems = (feed.body.match(/<item>/g) || []).length;
  if (!feedItems) add("HIGH", "/feeds/google-merchant.xml", "Merchant feed has no items");
  for (const field of ["g:id", "g:title", "g:link", "g:image_link", "g:price", "g:availability", "g:brand"]) {
    const n = (feed.body.match(new RegExp(`<${field}>`, "g")) || []).length;
    if (n < feedItems) add("HIGH", "/feeds/google-merchant.xml", `${feedItems - n} item(s) missing ${field}`);
  }
}
const llms = await get(`${BASE}/llms.txt`);
if (llms.status !== 200) add("LOW", "/llms.txt", `llms.txt returned ${llms.status || llms.error}`);

// Report
issues.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.where.localeCompare(b.where));
const count = (s) => issues.filter((i) => i.severity === s).length;
const summary = {
  base: BASE, checkedAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
  sitemapUrls: urls.length, pagesOk: [...pages.values()].filter((p) => p.status === 200).length, feedItems,
  avgResponseMs: pages.size ? Math.round([...pages.values()].reduce((s, p) => s + p.ms, 0) / pages.size) : 0,
  counts: { CRITICAL: count("CRITICAL"), HIGH: count("HIGH"), MEDIUM: count("MEDIUM"), LOW: count("LOW") },
};
const md = [
  `## SEO health: ${summary.counts.CRITICAL || summary.counts.HIGH ? "action needed" : "OK"}`,
  "",
  `Checked ${summary.sitemapUrls} sitemap URLs on ${BASE} at ${summary.checkedAt}. ${summary.pagesOk} returned 200. Merchant feed items: ${feedItems}. Average response: ${summary.avgResponseMs} ms.`,
  "",
  `| Severity | Count |`, `|---|---|`,
  ...Object.entries(summary.counts).map(([k, v]) => `| ${k} | ${v} |`),
  "",
  ...(issues.length ? ["| Severity | Where | Problem |", "|---|---|---|", ...issues.map((i) => `| ${i.severity} | ${i.where} | ${i.problem.replace(/\|/g, "/")} |`)] : ["No issues found."]),
].join("\n");
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ summary, issues, pages: [...pages.values()].map(({ links, ...p }) => p) }, null, 2));
if (opt("--md")) fs.writeFileSync(opt("--md"), md + "\n");
console.log(md);
process.exit(summary.counts.CRITICAL || summary.counts.HIGH ? 2 : 0);
