# Release 2: consolidated admin and storefront release

Base: production commit 61b013a (database version 12). Branch: `release-2`.

## Features
- Invoices: one per order (INV-YYYY-00001), created when a payment is verified or when opened/downloaded.
  Printable page, PDF download (admin and customer with the private order link), search, status filter, history.
  Amounts always come from the order. "Paid" only after admin verification. Free-delivery orders show FREE (₦0);
  older orders show their original delivery fee.
- Customers: directory (search by name, email, phone; sort), profile (contact, addresses, order history, verified
  payments, outstanding, activity, reviews), notes, CSV export (needs Customers + Reports).
- Staff permissions: 21 granular permissions, checked on the server in every page, server action and download.
  Owner keeps full access. Existing staff accounts keep their previous access (dashboard, orders, payments,
  customers, notifications, messages, reviews). Staff managers cannot grant permissions they lack or create owners.
  Undoing a payment confirmation stays owner-only.
- Coupons: searchable product and category pickers; usage history per coupon.
- Banners and homepage: create, edit, duplicate, delete, reorder, schedule, switch on/off, desktop and mobile
  images, admin-only preview; editable hero text. Free delivery message stays fixed in the top bar and hero.
- SEO: site settings (title template, home title/description, sharing image, whole-site noindex), per product and
  category title, description, sharing image and noindex, checks for missing/long/duplicate metadata, redirects
  with loop protection, automatic redirects when a product address changes, Product/Breadcrumb/Organization
  structured data, sitemap excludes hidden pages, robots.txt follows the noindex switch.
- Delivery dispatch: courier, tracking reference, dispatch date and notes (shown to the customer), and a
  "Paid, not dispatched" order filter.
- Analytics: paying customers, best-selling products, coupon performance, inventory performance.
- Security/platform: Next.js 14.2.35 → 15.5.29 and React 18 → 19 (14.x has unpatched critical advisories);
  sharp 0.35.5; AVIF output removed from image optimisation; rate limiter ignores spoofable forwarded IPs (earlier).
- Accessibility/performance: colour contrast, layout-shift fixes on cart and checkout, heading order, image ratios,
  database indexes for customer, order and coupon queries.

## Database migration v13 (additive only)
- `users.permissions` (NULL = previous staff access)
- new tables: `invoices`, `customer_notes`, `banners`, `redirects`, `product_redirects`
- new columns: `products.seo_title, meta_description, og_image, noindex`, `categories.noindex`
- new indexes on `orders(phone,id)`, `orders(coupon_code)`, `order_items(order_id)`, `order_items(variant_id)`, `order_events(order_id)`
Tested on a copy of a version-12 database: every original column of every table unchanged.

## Deployment
1. Fresh backup in the app container (Coolify > Terminal):
   `node -e 'const {DatabaseSync}=require("node:sqlite");new DatabaseSync("/data/store.db").exec("VACUUM INTO \x27/data/backups/store-pre-v13-YYYYMMDD.db\x27")'`
   then verify `pragma integrity_check` = ok and row counts match.
2. Fast-forward `main` to the release commit (no force push).
3. Coolify > Redeploy (normal). Do not use options that remove volumes.
4. Load the homepage once (runs migration 13), then check version 13 and row counts in the terminal.
5. Live checks: home, product, cart, checkout (Lagos FREE), admin login, an invoice PDF, customers page, SEO page.

## Rollback
- Code: Coolify > Rollback to 61b013a. Version-13 tables and columns are ignored by the old code.
- Data (only if needed): stop the app, copy the pre-v13 backup over `/data/store.db`, remove `store.db-wal` and
  `store.db-shm`, start the app. Orders placed after the deployment would be lost.
