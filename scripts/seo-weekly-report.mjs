#!/usr/bin/env node
/*
 * Weekly SEO report. Read-only. Writes Markdown to stdout (and to --out FILE).
 *   node scripts/seo-weekly-report.mjs --audit audit.json [--out report.md]
 *
 * Data sources, each optional so the report still runs before every account is connected:
 *   1. Live site audit JSON from scripts/seo-audit.mjs (always).
 *   2. Google Search Console (clicks, impressions, CTR, position, queries, pages) when GOOGLE_SA_JSON and GSC_SITE are set.
 *   3. Google Analytics 4 (organic sessions, key ecommerce events, purchase revenue) when GOOGLE_SA_JSON and GA4_PROPERTY_ID are set.
 *   4. Google autocomplete suggestions for the seed terms in docs/seo/keywords.csv (new searches people type in Nigeria).
 * GOOGLE_SA_JSON is a Google Cloud service-account key with read access added as a user in Search Console and GA4.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : "");
const audit = opt("--audit") && fs.existsSync(opt("--audit")) ? JSON.parse(fs.readFileSync(opt("--audit"), "utf8")) : null;
const day = (d) => d.toISOString().slice(0, 10);
const now = new Date();
// Search Console data lags about 2 to 3 days: compare the latest complete 7 days with the 7 days before.
const end = new Date(now.getTime() - 3 * 864e5), start = new Date(end.getTime() - 6 * 864e5);
const pEnd = new Date(start.getTime() - 864e5), pStart = new Date(pEnd.getTime() - 6 * 864e5);
const out = [];
const say = (...l) => out.push(...l);
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? "n/a" : Number(n).toLocaleString("en-NG", { maximumFractionDigits: d }));
const pct = (a, b) => (!b ? "" : ` (${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%)`);

async function googleToken(scope) {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) return null;
  const sa = JSON.parse(raw);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new Error(`Google token error ${r.status}`);
  return (await r.json()).access_token;
}

async function gsc(token, body) {
  const site = encodeURIComponent(process.env.GSC_SITE);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Search Console ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows || [];
}

async function ga4(token, body) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GA4 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows || [];
}

say(`# Weekly SEO report: ${day(now)}`, "");
const actions = [];

// Search performance
say("## Search performance (Google Search Console)", "");
try {
  const token = process.env.GSC_SITE ? await googleToken("https://www.googleapis.com/auth/webmasters.readonly") : null;
  if (!token) { say("Not connected yet. Add the GOOGLE_SA_JSON secret and the GSC_SITE variable to the repository to include clicks, impressions and queries.", ""); }
  else {
    const range = (a, b) => ({ startDate: day(a), endDate: day(b) });
    const [cur] = await gsc(token, { ...range(start, end), dimensions: [] }).then((r) => r.length ? r : [{}]);
    const [prev] = await gsc(token, { ...range(pStart, pEnd), dimensions: [] }).then((r) => r.length ? r : [{}]);
    say(`${day(start)} to ${day(end)} compared with the 7 days before.`, "",
      "| Metric | This week | Change |", "|---|---|---|",
      `| Clicks | ${fmt(cur.clicks)} | ${pct(cur.clicks || 0, prev.clicks || 0)} |`,
      `| Impressions | ${fmt(cur.impressions)} | ${pct(cur.impressions || 0, prev.impressions || 0)} |`,
      `| CTR | ${cur.ctr != null ? (cur.ctr * 100).toFixed(1) + "%" : "n/a"} | |`,
      `| Average position | ${fmt(cur.position, 1)} | ${prev.position ? (cur.position < prev.position ? "better" : "worse") : ""} |`, "");
    if (prev.clicks && cur.clicks < prev.clicks * 0.7 && prev.clicks >= 20) actions.push("HIGH: organic clicks fell more than 30% week on week. Check Search Console for indexing or ranking changes.");
    const queries = await gsc(token, { ...range(start, end), dimensions: ["query"], rowLimit: 25 });
    const prevQ = new Set((await gsc(token, { ...range(pStart, pEnd), dimensions: ["query"], rowLimit: 250 })).map((r) => r.keys[0]));
    if (queries.length) say("### Top search terms", "", "| Query | Clicks | Impressions | Position | New |", "|---|---|---|---|---|", ...queries.map((r) => `| ${r.keys[0]} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} | ${prevQ.has(r.keys[0]) ? "" : "new"} |`), "");
    const near = queries.filter((r) => r.position > 8 && r.position <= 20 && r.impressions >= 10);
    if (near.length) { say("### Close to page one (positions 8 to 20)", "", ...near.map((r) => `- ${r.keys[0]}: position ${r.position.toFixed(1)}, ${r.impressions} impressions`), ""); actions.push(`Improve the pages ranking for: ${near.slice(0, 3).map((r) => r.keys[0]).join(", ")}.`); }
    const pages = await gsc(token, { ...range(start, end), dimensions: ["page"], rowLimit: 25 });
    if (pages.length) say("### Top pages", "", "| Page | Clicks | Impressions | CTR |", "|---|---|---|---|", ...pages.map((r) => `| ${r.keys[0].replace(/^https?:\/\/[^/]+/, "")} | ${r.clicks} | ${r.impressions} | ${(r.ctr * 100).toFixed(1)}% |`), "");
    const lowCtr = pages.filter((r) => r.impressions >= 100 && r.ctr < 0.01);
    if (lowCtr.length) actions.push(`Rewrite titles and descriptions for high-impression, low-CTR pages: ${lowCtr.map((r) => r.keys[0].replace(/^https?:\/\/[^/]+/, "")).join(", ")}.`);
  }
} catch (e) { say(`Search Console data unavailable: ${e.message}`, ""); }

// Analytics
say("## Organic traffic and revenue (Google Analytics 4)", "");
try {
  const token = process.env.GA4_PROPERTY_ID ? await googleToken("https://www.googleapis.com/auth/analytics.readonly") : null;
  if (!token) say("Not connected yet. Add GOOGLE_SA_JSON and GA4_PROPERTY_ID to include organic sessions, add-to-carts, checkouts and confirmed purchases.", "");
  else {
    const organic = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } };
    const rows = await ga4(token, { dateRanges: [{ startDate: day(start), endDate: day(end) }], metrics: [{ name: "sessions" }, { name: "addToCarts" }, { name: "checkouts" }, { name: "ecommercePurchases" }, { name: "purchaseRevenue" }], dimensionFilter: organic });
    const v = rows[0]?.metricValues?.map((m) => Number(m.value)) || [0, 0, 0, 0, 0];
    say("| Organic metric | This week |", "|---|---|", `| Sessions | ${fmt(v[0])} |`, `| Add to carts | ${fmt(v[1])} |`, `| Checkouts started | ${fmt(v[2])} |`, `| Confirmed purchases | ${fmt(v[3])} |`, `| Revenue (NGN) | ${fmt(v[4])} |`, `| Conversion rate | ${v[0] ? ((v[3] / v[0]) * 100).toFixed(2) + "%" : "n/a"} |`, "");
    const lp = await ga4(token, { dateRanges: [{ startDate: day(start), endDate: day(end) }], dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "ecommercePurchases" }], dimensionFilter: organic, limit: 10, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] });
    if (lp.length) say("### Organic landing pages", "", "| Landing page | Sessions | Purchases |", "|---|---|---|", ...lp.map((r) => `| ${r.dimensionValues[0].value} | ${r.metricValues[0].value} | ${r.metricValues[1].value} |`), "");
    say("Purchases count only orders the store has confirmed as paid; pending bank transfers are excluded.", "");
  }
} catch (e) { say(`Analytics data unavailable: ${e.message}`, ""); }

// Technical
say("## Technical status (live crawl)", "");
if (audit) {
  const s = audit.summary;
  say(`Sitemap URLs: ${s.sitemapUrls}. Pages returning 200: ${s.pagesOk}. Merchant feed items: ${s.feedItems}. Average response: ${s.avgResponseMs} ms.`, "",
    `Issues: ${s.counts.CRITICAL} critical, ${s.counts.HIGH} high, ${s.counts.MEDIUM} medium, ${s.counts.LOW} low.`, "");
  const top = audit.issues.filter((i) => i.severity !== "LOW").slice(0, 15);
  if (top.length) say("| Severity | Where | Problem |", "|---|---|---|", ...top.map((i) => `| ${i.severity} | ${i.where} | ${i.problem} |`), "");
  for (const i of audit.issues.filter((x) => x.severity === "CRITICAL" || x.severity === "HIGH").slice(0, 3)) actions.unshift(`${i.severity}: ${i.where}: ${i.problem}`);
} else say("Audit data missing.", "");

// Keyword opportunities from autocomplete
say("## New search suggestions (Google autocomplete, Nigeria)", "");
try {
  const csv = fs.readFileSync("docs/seo/keywords.csv", "utf8").split("\n").slice(1).filter(Boolean);
  const known = new Set(csv.map((l) => l.split(",")[0].replace(/"/g, "").trim().toLowerCase()));
  const seeds = [...new Set(csv.filter((l) => /,seed,/.test(l)).map((l) => l.split(",")[0].replace(/"/g, "").trim()))].slice(0, 25);
  const fresh = [];
  for (const s of seeds) {
    const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&gl=ng&hl=en&q=${encodeURIComponent(s)}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!r?.ok) continue;
    const [, list] = JSON.parse(Buffer.from(await r.arrayBuffer()).toString("latin1"));
    for (const k of list || []) if (!known.has(k.toLowerCase())) fresh.push(`${k} (from "${s}")`);
  }
  say(fresh.length ? fresh.slice(0, 30).map((f) => `- ${f}`).join("\n") : "No new suggestions this week.", "", "Autocomplete shows what people type, not how many searches each term gets.", "");
} catch (e) { say(`Suggestions unavailable: ${e.message}`, ""); }

say("## Next actions", "", ...(actions.length ? actions.slice(0, 6).map((a, i) => `${i + 1}. ${a}`) : ["1. No urgent issues. Publish the next guide from docs/seo/content-calendar.md and review new suggestions above."]), "");
const md = out.join("\n");
if (opt("--out")) fs.writeFileSync(opt("--out"), md + "\n");
console.log(md);
