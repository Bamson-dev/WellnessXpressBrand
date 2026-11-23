# SEO baseline audit: wellnessxpressbrand.com

Audited 23 November 2026 against production commit 7d13dd2, before the SEO release.

## Stack and setup

- Next.js 15 App Router, server-rendered (every store page is dynamic and reads the live SQLite catalogue). Content is in the HTML, so crawlers do not need to run JavaScript to read it.
- Hosting: Contabo VPS, Coolify, behind Cloudflare. HTTPS with HSTS.
- Existing SEO code: `src/app/robots.ts`, `src/app/sitemap.ts`, per-page `generateMetadata`, canonical tags, Open Graph tags, JSON-LD (Organization, Product, BreadcrumbList, FAQPage), an admin SEO dashboard with redirects and title/description checks.
- Analytics: code supported GA4 and Plausible, but no GA4 ID was set, so no analytics ran on the store. Meta Pixel and Conversions API exist separately.
- Search Console: only leadthur.com was verified on the account. wellnessxpressbrand.com was not a property.
- Bing Webmaster Tools: not set up.
- Merchant Center: no product feed existed.
- Google already indexes the homepage (brand search shows it first) and the weightloss.wellnessxpressbrand.com WordPress funnel.

## Crawl results (24 sitemap URLs)

| Check | Result |
|---|---|
| Status codes | All 24 return 200 |
| Canonical | All 24 self-canonical |
| H1 | Exactly one H1 on every page |
| Open Graph image | Present on every page |
| Image alt text | No images without alt |
| JSON-LD | Valid on every page. Product + BreadcrumbList on all 12 products |
| robots.txt | Allows all crawlers, blocks /api/, /admin, /checkout, /cart, /order/, lists the sitemap |
| Crawler access | Googlebot, Bingbot, OAI-SearchBot and PerplexityBot user agents get 200 on pages and robots.txt (tested from the VPS through Cloudflare) |
| Performance (390 px, earlier audit) | Home about 338 KB, LCP 1.4 s, CLS 0. Product images optimised in PR #9 |

## Issues found

| Severity | Issue | Fix |
|---|---|---|
| High | Site not verified in Search Console or Bing, so no indexing or query data | Google HTML-tag verification added in code; Bing through import from Search Console |
| High | No analytics on the store | GA4 property created; measurement ID loads at runtime; ecommerce events added |
| High | No Merchant Center feed | `/feeds/google-merchant.xml` built from the live catalogue |
| Medium | Product structured data used one AggregateOffer, which Merchant listings treat as less precise | One Offer per size with price, stock, condition and seller |
| Medium | No WebSite structured data; Organization had no social profiles | Added WebSite; Organization now lists social profiles from admin settings |
| Medium | Thin meta descriptions: categories (39 and 49 characters), About (26), Contact (49) | Longer, accurate descriptions; category fallback extends short blurbs |
| Medium | No editorial content, so nothing ranks for informational searches | Guides section with a quality gate; two sourced guides published |
| Medium | Product pages are thin (about 200 words) and have no verified ingredients or directions | Blocked on verified label information from the owner. Not invented |
| Low | Sitemap had no image entries | Product images added to the sitemap |
| Low | No llms.txt | Added a factual llms.txt built from the catalogue |
| Low | CSP only allowed www.google-analytics.com, which would block GA4 regional endpoints | CSP widened to Google's documented GA4 hosts only |

## Not changed on purpose

- Product names, prices, stock, delivery rules, checkout, cart, orders and payments.
- robots.txt rules: they were already correct. AI training crawlers keep the current setting (allowed by the general rule); nothing new was opened.
- Product titles: the title template already gives "Product | WellnessXpressBrand".
