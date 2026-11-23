# WellnessXpressBrand SEO system

How search visibility is built, measured and maintained. Start here.

## What runs where

| Part | Where | What it does |
|---|---|---|
| Sitemap | `src/app/sitemap.ts` → /sitemap.xml | Built from the live catalogue on each request. Products (with images), categories, published guides and policy pages. Hidden and noindex items drop out automatically |
| robots.txt | `src/app/robots.ts` | Allows public pages, blocks /api/, /admin, /checkout, /cart, /order/. Lists the sitemap |
| Structured data | store layout, product, category, FAQ and guide pages | Organization (with social profiles), WebSite, Product with one Offer per size, BreadcrumbList, FAQPage, Article |
| Merchant feed | `src/app/feeds/google-merchant/route.ts` (served at /feeds/google-merchant.xml through a rewrite in next.config.mjs) | Google Merchant Center feed, one item per size, live prices and stock, no invented GTINs |
| llms.txt | `src/app/llms-txt/route.ts` (served at /llms.txt through a rewrite) | Short factual site map for AI assistants. Complements, never replaces, robots.txt and the sitemap |
| Search Console verification | `GOOGLE_SITE_VERIFICATION` in `src/lib/site.ts` (env override) | HTML tag on every store page |
| Bing verification | `BING_SITE_VERIFICATION` env (optional) | Only needed if Bing import from Search Console is not used |
| GA4 | `GA_MEASUREMENT_ID` runtime env in Coolify; `src/components/Analytics.tsx`, `src/components/ga.tsx` | Page views plus view_item, add_to_cart, remove_from_cart, view_cart, begin_checkout, purchase |
| Guides | `content/guides/*.md` → /guides | Editorial content with front matter, rendered safely without HTML injection |
| Quality gate | `scripts/content-check.mjs` + `src/lib/guide-format.ts` | Blocks publishing on missing sources, risky health claims, thin content, broken links, placeholders. Runs in CI |
| Live monitor | `scripts/seo-audit.mjs` + `.github/workflows/seo-monitor.yml` | Daily crawl. Opens one GitHub issue on CRITICAL or HIGH problems, closes it when fixed |
| Weekly report | `scripts/seo-weekly-report.mjs` (same workflow, Mondays) | Crawl status plus Search Console, GA4 and new autocomplete suggestions, posted as a GitHub issue |
| Research | `keywords.csv`, `competitors.csv`, `topic-clusters.md`, `brand-entity.md`, `backlink-tracker.csv` | Keyword database, SERP snapshot, content plan, brand record, outreach tracker |

## Publishing a guide

1. Pick the next item in `topic-clusters.md`.
2. Read the sources (WHO, NHS, NAFDAC or similar for health facts). Write the guide in `content/guides/<slug>.md` with the front matter described in `src/lib/guide-format.ts`.
3. Start with `status: draft`. Run `node --experimental-strip-types scripts/content-check.mjs`.
4. Set `risk: high` for anything about medical conditions, medicines, pregnancy or product effects. High-risk guides need `reviewed:` with a real person's name and role before they can publish.
5. Change to `status: published`, open a PR, wait for CI (the gate runs there too), merge, redeploy in Coolify. The sitemap, llms.txt and product-page "Helpful guides" update automatically.

Never write ingredients, benefits, results, reviews or testimonials that are not verified.

## Severity levels used by the monitor

- CRITICAL: site or sitemap down, robots.txt blocking the site, product pages failing or noindexed.
- HIGH: canonical errors, invalid structured data, sitemap listing private or redirecting URLs, feed broken.
- MEDIUM: missing titles or descriptions, broken internal links, orphan pages, slow pages.
- LOW: long titles, short descriptions, missing og:image.

## Connecting the reporting data (one-time)

The weekly report includes Search Console and GA4 numbers once these exist in the GitHub repository settings:

1. Google Cloud: create a service account, enable the Search Console API and the Google Analytics Data API, download a JSON key.
2. Search Console: add the service account email as a user (Restricted is enough) on the wellnessxpressbrand.com property.
3. GA4: add the service account email as a Viewer on the WellnessXpressBrand property.
4. GitHub, Settings, Secrets and variables, Actions: secret `GOOGLE_SA_JSON` (the key), variables `GSC_SITE` (`https://wellnessxpressbrand.com/` or `sc-domain:wellnessxpressbrand.com`) and `GA4_PROPERTY_ID` (numbers only).

## Bank transfer purchases in GA4

A purchase event fires only on the customer's order page after the store marks the order paid, once per order per browser. Pending and awaiting-verification transfers never fire. This undercounts purchases when the customer does not reopen the order page after payment confirmation. GA4 attributes the purchase to the customer's earlier organic visit through its normal cross-session attribution. A server-side Measurement Protocol event on admin payment confirmation would count every paid order; it touches the payment confirmation flow, so it is left for a separate, approved change.
