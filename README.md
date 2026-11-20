# WellnessXpressBrand

WellnessXpressBrand's Nigerian online store: https://wellnessxpressbrand.com.

## Stack and data

Next.js 14 App Router, TypeScript, Tailwind CSS 3, and SQLite (`node:sqlite`, Node 22+). The catalogue, variants, settings, and orders live in the database. Uploaded media and payment receipts live under `DATA_DIR` (`/data` in the container); mount a persistent volume there. Schema upgrades run through numbered SQLite migrations and preserve existing order records.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `COMING_SOON=false` in `.env.local` to preview the storefront. Checks: `npm run typecheck`, `npm run lint`, and `npm run build`.

## Store and administration

Products, variants, stock, product images, combo contents, prices, and visibility are managed in `/admin`. Product and combo artwork lives in `public/images/products/`; the original product photos are retained in `public/images/products/originals/`. Prices are stored as whole NGN amounts in SQLite and are quoted server-side for cart and checkout.

Guest checkout uses manual bank transfer. Product payment is collected first; the delivery fee and its payment are recorded separately. A payment reference or receipt only submits a verification request; an authorized admin confirms money received. Admin credentials and session secrets must be set in the deployment environment, never committed.

## Deployment (Coolify)

The existing Coolify app uses this Dockerfile, branch `main`, port `3000`, health check `/api/health`, and the persistent `/data` volume. Back up the persistent volume before deploying schema changes and confirm it remains mounted after redeploy. `COMING_SOON=true` serves the Coming Soon page to the public while admins can prepare the store. Set `COMING_SOON=false` to publish the storefront; the sitemap switches automatically.

Do not push a production-triggering change until its build, migration, and data-volume behavior have been reviewed. `NEXT_PUBLIC_*` settings are baked in at build time and require a rebuild after changes.

## Key environment settings

See `.env.example`. Important settings include `DATA_DIR`, `COMING_SOON`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_WHATSAPP_NUMBER`. Keep credentials and production data out of Git.


## Production deployment stability (Server Actions)

The app uses Next.js Server Actions in the admin. Avoid version-skew during redeploys:
- Set a unique `NEXT_DEPLOYMENT_ID` for every production build (use the source commit SHA).
- Keep the app on one active production build at a time unless the deployment platform routes requests consistently.
- Do not reuse old browser HTML or static assets across releases. After a deploy, refresh clients if the deployment ID changes.
- Optionally set a stable, secure `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` as a Coolify build-time variable, generated once and kept private. Never commit it.


## Required Coolify build arguments for stable Server Actions

Configure the following **build arguments** in Coolify for this Docker build:
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: a persistent base64 AES key (16, 24, or 32 decoded bytes). Do not rotate it on each deploy and never commit it to Git.
- `NEXT_DEPLOYMENT_ID`: optional unique build identifier. The Dockerfile generates a unique value when omitted.

Use the same persistent Server Actions key for every production build and every running instance. After changing it, perform a full rebuild and ensure only the current release serves traffic. Keep the key private.
