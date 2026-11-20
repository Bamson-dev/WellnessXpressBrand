# WellnessXpressBrand

WellnessXpressBrand's Nigerian online store: https://wellnessxpressbrand.com.

## Stack and data

Next.js 15.5.29 App Router, React 19, TypeScript, Tailwind CSS 3, and SQLite (`node:sqlite`, Node 22+). The catalogue, variants, settings, and orders live in SQLite. Uploaded media and payment receipts live under `DATA_DIR` (`/data` in the container); mount a persistent volume there. Schema upgrades run through numbered SQLite migrations and preserve existing order records.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `COMING_SOON=false` in `.env.local` to preview the storefront. Run `npm run typecheck`, `npm run lint`, and `npm run build` for code checks.

## Store and administration

Products, variants, stock, product images, combo contents, prices, and visibility are managed in `/admin`. Product and combo artwork lives in `public/images/products/`; original product photos are retained in `public/images/products/originals/`. Prices are stored as whole NGN amounts in SQLite and quoted server-side for cart and checkout.

Checkout uses manual bank transfer for product payment. The customer can submit a transfer reference or receipt, but only an authorized admin can confirm payment after checking the bank account. The current store policy provides free delivery across enabled Nigerian states. Older orders may retain their historical delivery-fee details. Admin credentials and session secrets must be set in the deployment environment, never committed.

## End-to-end tests

The test script `tests/e2e.mjs` requires the `playwright` package and a Chromium installation. These are not currently declared in `package.json`. Install Playwright and Chromium before running the script. Use a disposable test data directory and local test server only. Never run the tests against production or its persistent `/data` volume.

## Deployment (Coolify)

The existing Coolify app uses this Dockerfile, branch `main`, port `3000`, health check `/api/health`, and the persistent `/data` volume. Back up the persistent volume before deploying schema changes and confirm it remains mounted after redeploy. `COMING_SOON=true` serves the Coming Soon page to the public while admins can prepare the store. Set `COMING_SOON=false` to publish the storefront; the sitemap switches automatically.

Do not push a production-triggering change until its build, migration, and data-volume behavior have been reviewed. `NEXT_PUBLIC_*` settings are baked in at build time and require a rebuild after changes.

## Key environment settings

See `.env.example`. Important settings include `DATA_DIR`, `COMING_SOON`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_WHATSAPP_NUMBER`. Keep credentials and production data out of Git.
