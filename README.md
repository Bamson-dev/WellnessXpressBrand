# WellnessXpressBrand

Online store for wellness and lifestyle products at https://wellnessxpressbrand.com.

## Stack
Next.js 14 (App Router), TypeScript, Tailwind CSS 3, Docker. No database in v1: the catalogue lives in JSON files and submissions are appended to files on a persistent volume.

## Local development
```
npm install
cp .env.example .env.local
SHOW_SAMPLE_PRODUCTS=true npm run dev
```
Open http://localhost:3000. Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

## Deployment (Coolify)
Coolify project `WellnessXpressBrand`, environment `production`, application `wellnessxpressbrand`, build pack Dockerfile, branch `main`, port 3000, health check `/api/health`. Domains: `https://wellnessxpressbrand.com` and `https://www.wellnessxpressbrand.com`. Mount a persistent volume at `/data`. Push to `main` and redeploy to publish changes.

## Environment variables
See `.env.example`. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## Add products
Edit `src/data/products.json`. Each product has: `sku` (unique), `slug` (unique, URL-safe), `name`, `description`, `price` and `salePrice` (naira, whole numbers, `salePrice` may be `null`), `images` (list of paths under `public/products/`), `category` (a slug from `src/data/categories.json`), `availability` (`in_stock`, `out_of_stock`, `preorder`), `attributes` (key and value text) and `status`. Set `status` to `published` to show a product. `draft` hides it. `sample` entries show only when `SHOW_SAMPLE_PRODUCTS=true` (never in production). Delete the two sample entries before launch. Commit, push, redeploy.

## Update product images
Put image files in `public/products/` (JPG or WebP, about 1000 px wide, under 200 KB each), then list them as `/products/file.jpg` in the product's `images`.

## Categories
Edit `src/data/categories.json`. Footer and home links to `/category/wellness` and `/category/lifestyle` are in `src/components/Footer.tsx`.

## WhatsApp
Set `NEXT_PUBLIC_WHATSAPP_NUMBER` to the business number in international format, digits only. Redeploy. Buttons stay hidden or disabled until it is set.

## Payments
Payments are off. Checkout stores an order request with status `awaiting_payment_setup` and `paid: false`. No code path marks an order paid. To connect a provider (for example Paystack or Flutterwave), add a server route that creates a transaction from the server-side price, verifies the provider webhook signature, and only then updates the order. Keep provider secret keys in Coolify environment variables, never in Git.

## Stored data
Files in `/data`: `orders.jsonl`, `contact.jsonl`, `newsletter.jsonl`. Back up this volume. Personal data lives here, so restrict access.

## Content that needs the business owner
Legal pages contain `[CONFIRM]` markers. Add real products, prices, images, business details, WhatsApp number, contact email, shipping areas and fees, and the returns policy.

## Known limits
No customer accounts, no admin dashboard and no stock counts yet. Rate limiting is in memory per instance.

## Coming Soon mode

The public site shows only the Coming Soon page (`src/app/coming-soon`). `src/middleware.ts` rewrites every URL to it, keeps `/api/health` and `/api/newsletter` active, and returns 503 for the other API routes (orders and contact).
The storefront lives in `src/app/(store)` and stays in the repo. To launch it: set `COMING_SOON=false` in Coolify, restore the full list in `src/app/sitemap.ts`, and redeploy. The branch `storefront-v1` holds the storefront as it was before Coming Soon mode.
