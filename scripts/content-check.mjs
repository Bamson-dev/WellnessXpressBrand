#!/usr/bin/env node
/*
 * Quality gate for editorial guides (content/guides/*.md). Runs in CI and before any guide is published.
 *   node --experimental-strip-types scripts/content-check.mjs [--live https://wellnessxpressbrand.com]
 * Fails (exit 1) when a guide marked "published" has an error: missing sources, risky health claims,
 * thin content, broken product links, unresolved placeholders. Drafts are reported but never fail the build.
 * With --live, product slugs and internal links are also checked against the live sitemap.
 */
import fs from "node:fs";
import path from "node:path";
import { checkGuide, parseGuide } from "../src/lib/guide-format.ts";

const dir = path.join(process.cwd(), "content", "guides");
const live = process.argv.includes("--live") ? process.argv[process.argv.indexOf("--live") + 1] : "";
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
let liveUrls = null;
if (live) {
  const xml = await (await fetch(`${live.replace(/\/$/, "")}/sitemap.xml`)).text();
  liveUrls = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
}
const guides = files.map((f) => parseGuide(f.replace(/\.md$/, ""), fs.readFileSync(path.join(dir, f), "utf8")));
const slugs = new Set(guides.map((g) => g.slug));
let failed = 0;
for (const g of guides) {
  const { errors, warnings, words } = checkGuide(g);
  for (const m of g.body.matchAll(/\]\((\/[^)]*)\)/g)) {
    const href = m[1];
    const gm = /^\/guides\/([a-z0-9-]+)$/.exec(href);
    if (gm && !slugs.has(gm[1])) errors.push(`links to a guide that does not exist: ${href}`);
    if (liveUrls && !gm && !liveUrls.has(href)) warnings.push(`internal link not in the live sitemap: ${href}`);
  }
  if (liveUrls) for (const p of g.products) if (!liveUrls.has(`/product/${p}`)) errors.push(`product "${p}" is not a live product page`);
  const blocking = g.status === "published" && errors.length > 0;
  if (blocking) failed++;
  console.log(`${blocking ? "FAIL" : errors.length ? "DRAFT-ISSUES" : "OK"}  ${g.slug}  [${g.status}, ${words} words]`);
  for (const e of errors) console.log(`   error: ${e}`);
  for (const w of warnings) console.log(`   warn:  ${w}`);
}
console.log(`\n${guides.length} guides checked, ${failed} published guide(s) failing.`);
process.exit(failed ? 1 : 0);
