/*
 * End-to-end and integration tests for the WellnessXpressBrand store.
 * Runs against a local server that uses a DISPOSABLE data directory. Never point it at production.
 *
 *   DATA_DIR=/tmp/wx-test ADMIN_EMAIL=owner@test.local ADMIN_PASSWORD=test-password-123 npx next start -p 3300
 *   WX_BASE=http://localhost:3300 WX_DATA=/tmp/wx-test node tests/e2e.mjs
 *
 * Requires the `playwright` package with Chromium available (for example `npm i -D playwright && npx playwright install chromium`).
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const { DatabaseSync } = require("node:sqlite");

const B = process.env.WX_BASE || "http://localhost:3300";
const DATA = process.env.WX_DATA;
if (!DATA || /^\/data\/?$/.test(DATA)) { console.error("Set WX_DATA to the disposable test data directory."); process.exit(2); }
const SHOTS = process.env.WX_SHOTS || path.join(process.cwd(), "test-results");
fs.mkdirSync(SHOTS, { recursive: true });
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname));
const sql = () => new DatabaseSync(path.join(DATA, "store.db"));
const q1 = (s, ...p) => { const d = sql(); try { return d.prepare(s).get(...p); } finally { d.close(); } };
const qa = (s, ...p) => { const d = sql(); try { return d.prepare(s).all(...p); } finally { d.close(); } };

let pass = 0, fail = 0;
const results = [];
function ok(cond, name) { results.push([cond ? "PASS" : "FAIL", name]); cond ? pass++ : fail++; console.log(cond ? "✓" : "✗", name); }
async function step(name, fn) { try { await fn(); } catch (e) { ok(false, `${name} threw: ${String(e.message).split("\n")[0]}`); } }
// Click a submit control and wait for the server action round trip (POST, redirect, re-render).
async function go(page, loc) {
  const before = page.url();
  const done = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 30000 });
  await loc.click();
  await done;
  await page.waitForURL((u) => u.href !== before, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
const flash = async (p) => {
  const m = new URL(p.url()).searchParams.get("msg") || "";
  if (m) await p.locator("[role=status]", { hasText: m.slice(0, 40) }).first().waitFor({ timeout: 8000 }).catch(() => {});
  return (await p.locator("[role=status]").first().textContent({ timeout: 8000 }).catch(() => "")) || "";
};

const browser = await chromium.launch();
const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const anon = await browser.newContext();
const order = {};
const metaRequests = [];
browser.on?.("disconnected", () => {});
for (const c of [admin.context(), anon]) c.on("request", (r) => { if (/facebook\.(com|net)/.test(r.url())) metaRequests.push(r.url()); });

// ---------------- security (signed out) ----------------
await step("security", async () => {
  for (const u of ["/api/admin/export", "/api/admin/delivery-export", "/api/admin/receipt/1"]) ok((await anon.request.get(B + u)).status() === 404, `signed-out ${u} is hidden (404)`);
  for (const u of ["/admin/inventory", "/admin/media", "/admin/delivery", "/admin/products"]) {
    const r = await anon.request.get(B + u); ok(/\/admin\/login/.test(r.url()), `signed-out ${u} redirects to login`);
  }
  ok((await anon.request.get(B + "/product-images/..%2F..%2Fstore.db")).status() === 404, "path traversal on /product-images rejected");
  ok((await anon.request.get(B + "/product-images/abc.png")).status() === 404, "non-generated image names rejected");
  const x = await anon.request.post(B + "/api/orders", { headers: { origin: "https://evil.example" }, data: { name: "x" } });
  ok(x.status() === 403, "cross-site order POST rejected");
  ok((await anon.request.get(B + "/product/detox-seed?preview=1")).status() === 404, "hidden product preview not available to the public");
});

// ---------------- admin login ----------------
await step("admin login", async () => {
  await admin.goto(B + "/admin/login");
  await admin.fill("#email", process.env.ADMIN_EMAIL || "owner@test.local");
  await admin.fill("#password", "wrong-password-xx"); await admin.click("button:has-text('Sign in')");
  ok(await admin.locator("text=not correct").waitFor({ timeout: 8000 }).then(() => true, () => false), "wrong password rejected");
  await admin.fill("#password", process.env.ADMIN_PASSWORD || "test-password-123"); await admin.click("button:has-text('Sign in')");
  await admin.waitForURL(B + "/admin"); ok(true, "owner can sign in");
});

// ---------------- delivery settings ----------------
await step("delivery admin", async () => {
  await admin.goto(B + "/admin/delivery");
  ok((await admin.locator('input[name^="fee_"]').count()) === 37, "delivery page lists all 36 states + FCT (37 rows)");
  ok(q1("SELECT COUNT(*) c FROM delivery_zones").c === 37, "37 delivery records exist in the database");
  ok(q1("SELECT COUNT(*) c FROM delivery_zones WHERE fee IS NOT NULL").c === 0, "no delivery fee invented on a fresh install");
  const set = async (st, fee, on, eta) => {
    await admin.fill(`input[name="fee_${st}"]`, fee);
    const cb = admin.locator(`input[name="active_${st}"]`); if ((await cb.isChecked()) !== on) await cb.click();
    if (eta) await admin.fill(`input[name="eta_${st}"]`, eta);
  };
  await set("Lagos", "3500", true, "1–2 working days");
  await set("Ogun", "4000", true, "2–3 working days");
  await set("FCT (Abuja)", "6000", true, "");
  await set("Kano", "7000", false, "");
  await set("Abia", "", true, "");
  await go(admin, admin.locator("button:has-text('Save delivery settings')").first());
  const m = await flash(admin); ok(/Abia/.test(m), "switched-on state without a fee is reported and stays unavailable");
  const lag = q1("SELECT * FROM delivery_zones WHERE state='Lagos'");
  ok(lag.fee === 3500 && lag.active === 1 && lag.eta === "1–2 working days", "Lagos fee, status and delivery time saved");
  ok(q1("SELECT active FROM delivery_zones WHERE state='Abia'").active === 0, "Abia without fee is stored as unavailable");
  // bulk
  await admin.goto(B + "/admin/delivery");
  for (const st of ["Oyo", "Osun"]) await admin.check(`input[name="states"][value="${st}"]`);
  await admin.selectOption('select[name="op"]', "fee"); await admin.fill('input[name="bulkFee"]', "4500");
  await go(admin, admin.locator("button:has-text('Apply to ticked states')").first());
  ok(qa("SELECT fee, active FROM delivery_zones WHERE state IN ('Oyo','Osun')").every((r) => r.fee === 4500 && r.active === 1), "bulk update sets fee for several states");
  // export
  const csv = await (await admin.request.get(B + "/api/admin/delivery-export")).text();
  const lines = csv.trim().split(/\r?\n/);
  ok(lines.length === 38 && /Lagos,3500,yes/.test(csv), "delivery CSV export has header + 37 rows");
  // import: bad file shows problems, saves nothing
  const bad = path.join(SHOTS, "bad.csv"); fs.writeFileSync(bad, "State,Fee,Enabled,ETA,Note\nEkiti,abc,yes,,\nAtlantis,100,yes,,\n");
  await admin.setInputFiles('input[name="file"]', bad); await go(admin, admin.locator("button:has-text('Preview import')").first());
  ok(await admin.locator("text=Fix these problems").waitFor({ timeout: 8000 }).then(() => true, () => false), "import preview reports invalid rows");
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Ekiti'").fee === null, "invalid import saves nothing");
  const good = path.join(SHOTS, "good.csv"); fs.writeFileSync(good, "State,Fee,Enabled,ETA,Note\nEkiti,5000,yes,3–5 working days,via park\n");
  await admin.goto(B + "/admin/delivery");
  await admin.setInputFiles('input[name="file"]', good); await go(admin, admin.locator("button:has-text('Preview import')").first());
  await go(admin, admin.locator("button:has-text('Save these 1 states')").first());
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Ekiti'").fee === 5000, "valid import applied after preview");
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Lagos'").fee === 3500, "states missing from the import are unchanged");
  await admin.screenshot({ path: path.join(SHOTS, "admin-delivery.png"), fullPage: true });
});

// ---------------- inventory ----------------
const oil = q1("SELECT id FROM variants WHERE sku='WX-GET-SNATCHED-OIL-1MONTH'").id;
await step("inventory", async () => {
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  const row = admin.locator("tr", { hasText: "WX-GET-SNATCHED-OIL-1MONTH" });
  await row.locator('input[name="qty"]').fill("3"); await go(admin, row.locator("button:has-text('Save')").last());
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "opening stock set to 3");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("increase"); await row.locator('input[name="qty"]').fill("2"); await go(admin, row.locator("button:has-text('Save')").last());
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "stock increase recorded (5)");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("decrease"); await row.locator('input[name="qty"]').fill("99"); await go(admin, row.locator("button:has-text('Save')").last());
  ok(/Only 5 in stock/.test(await flash(admin)), "cannot remove more stock than exists");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('input[name="threshold"]').fill("2"); await go(admin, row.locator("form:has(input[name=threshold]) button"));
  ok(q1("SELECT low_stock_threshold t FROM variants WHERE id=?", oil).t === 2, "low-stock threshold saved");
  ok(q1("SELECT COUNT(*) c FROM stock_movements WHERE variant_id=?", oil).c >= 2, "stock changes written to movement history");
  await admin.goto(B + "/admin/inventory?status=untracked");
  ok((await admin.locator("text=Not tracked").count()) > 0, "inventory status filter works");
});

// ---------------- media library ----------------
await step("media", async () => {
  await admin.goto(B + "/admin/media");
  await admin.setInputFiles('input[name="images"]', [path.join(FIX, "fixture-product.png"), path.join(FIX, "fixture-not-image.png")]);
  await go(admin, admin.locator("button:has-text('Upload')").first());
  const m = await flash(admin);
  ok(/1 uploaded/.test(m) && /not a JPG, PNG or WebP/.test(m), "image accepted, fake image rejected by content check");
  const med = q1("SELECT * FROM media WHERE builtin=0 ORDER BY id DESC LIMIT 1");
  ok(!!med && fs.existsSync(path.join(DATA, med.file)) && med.file.startsWith("product-images/"), "upload stored under DATA_DIR/product-images");
  ok((await anon.request.get(B + med.url)).status() === 200, "uploaded image served publicly");
  const card = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  await card.locator('input[name="alt"]').fill("Test pouch on a light background"); await go(admin, card.locator("button:has-text('Save text')"));
  ok(q1("SELECT alt FROM media WHERE id=?", med.id).alt === "Test pouch on a light background", "alt text saved");
  const tb = q1("SELECT id FROM products WHERE slug='tummy-balance'").id;
  await admin.goto(B + `/admin/products/${tb}`);
  await admin.selectOption('select[name="mediaId"]', String(med.id)); await go(admin, admin.locator("form:has(select[name=mediaId]) button").first());
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).includes(med.url), "image added to gallery from library");
  await admin.goto(B + "/admin/media");
  const card2 = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  ok((await card2.locator("text=Delete").count()) === 0, "image in use cannot be deleted");
  // replace the new photo (index 1) with a second upload
  await admin.goto(B + `/admin/products/${tb}`);
  const idx = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).indexOf(med.url);
  const rep = admin.locator(`form:has(input[name=index][value="${idx}"]):has(input[name=image])`);
  await rep.locator('input[name="image"]').setInputFiles(path.join(FIX, "fixture-product-2.png")); await go(admin, rep.locator("button:has-text('Replace')"));
  const imgs = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images);
  ok(!imgs.includes(med.url) && imgs[idx].startsWith("/product-images/"), "gallery image replaced");
  await admin.goto(B + "/admin/media");
  const card3 = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  await card3.locator("summary:has-text('Delete')").click(); await go(admin, card3.locator("button:has-text('Confirm permanent delete')"));
  ok(!q1("SELECT 1 x FROM media WHERE id=?", med.id) && !fs.existsSync(path.join(DATA, med.file)), "unused image deleted from library and disk");
  // reorder: move replaced image up to main
  await admin.goto(B + `/admin/products/${tb}`);
  await go(admin, admin.locator(`form:has(input[name=index][value="${idx}"]):has(input[name=op][value=first]) button`));
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images)[0] === imgs[idx], "gallery reorder: make main");
  await go(admin, admin.locator(`form:has(input[name=index][value="0"]):has(input[name=op][value=down]) button`));
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images)[1] === imgs[idx], "gallery reorder: move down");
});

// ---------------- products ----------------
await step("products", async () => {
  await admin.goto(B + "/admin/products");
  await admin.fill('input[name="name"]', "E2E Test Product"); await go(admin, admin.locator("button:has-text('Add product')").first());
  await admin.waitForURL(/\/admin\/products\/\d+/);
  const pid = Number(admin.url().split("/").pop().split("?")[0]);
  ok(q1("SELECT status FROM products WHERE id=?", pid).status === "draft", "new product created as draft");
  await admin.fill('textarea[name="description"]', "First paragraph with **bold**.\n\n- point one\n- point two");
  await go(admin, admin.locator("button:has-text('Save product')").first());
  ok(/\*\*bold\*\*/.test(q1("SELECT description d FROM products WHERE id=?", pid).d), "product description saved");
  const vform = admin.locator("form:has(input[name=label][placeholder='e.g. Big'])").last();
  await vform.locator('input[name="label"]').fill("Standard"); await vform.locator('input[name="price"]').fill("9000"); await go(admin, vform.locator("button:has-text('Add option')"));
  ok(q1("SELECT COUNT(*) c FROM variants WHERE product_id=?", pid).c === 1, "price option added");
  const slug = q1("SELECT slug FROM products WHERE id=?", pid).slug;
  const pv = await admin.goto(B + `/product/${slug}?preview=1`);
  ok(pv.status() === 200 && (await admin.locator("text=Preview: this product is draft").isVisible()), "admin can preview a draft product");
  ok((await admin.locator("article strong, .card strong").filter({ hasText: "bold" }).count()) > 0 && (await admin.locator("li", { hasText: "point one" }).count()) > 0, "formatted description renders bold and lists safely");
  // bulk publish + feature
  await admin.goto(B + "/admin/products?q=e2e");
  await admin.check(`input[name="ids"][value="${pid}"]`); await admin.selectOption('form#bulk-products select[name="op"]', "publish"); await go(admin, admin.locator("form#bulk-products button").first());
  ok(q1("SELECT status FROM products WHERE id=?", pid).status === "published", "bulk publish");
  ok((await anon.request.get(B + `/product/${slug}`)).status() === 200, "published product visible to customers");
  // duplicate
  await admin.goto(B + "/admin/products?q=e2e");
  await go(admin, admin.locator("tr", { hasText: "E2E Test Product" }).first().locator("button:has-text('Duplicate')"));
  await admin.waitForURL(/\/admin\/products\/\d+/);
  const dup = Number(admin.url().split("/").pop().split("?")[0]);
  ok(dup !== pid && q1("SELECT status FROM products WHERE id=?", dup).status === "draft", "duplicate created as draft");
  // archive then delete (never ordered)
  await admin.goto(B + "/admin/products?q=copy");
  await admin.check(`input[name="ids"][value="${dup}"]`); await admin.selectOption('form#bulk-products select[name="op"]', "archive"); await go(admin, admin.locator("form#bulk-products button").first());
  ok(q1("SELECT status FROM products WHERE id=?", dup).status === "archived", "bulk archive");
  await admin.goto(B + `/admin/products/${dup}`);
  await admin.click("summary:has-text('Delete this product permanently')");
  await admin.fill('input[name="confirm"]', q1("SELECT name FROM products WHERE id=?", dup).name); await go(admin, admin.locator("button:has-text('Delete permanently')").first());
  ok(!q1("SELECT 1 x FROM products WHERE id=?", dup), "archived, never-ordered product deleted");
});

// ---------------- customer checkout + delivery ----------------
let orderNumber = "";
await step("checkout", async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(B + "/product/get-snatched-oil"); await p.getByRole("button", { name: /Add to cart/ }).first().click();
  await p.getByRole("dialog", { name: "Your cart" }).waitFor();
  await p.goto(B + "/cart"); await p.locator("button[aria-label='Increase quantity']").first().click(); await p.waitForTimeout(600);
  ok((await p.locator("aside").innerText()).includes("30,000"), "cart quantity change updates subtotal (2 × ₦15,000)");
  await p.goto(B + "/checkout"); await p.waitForLoadState("networkidle");
  ok((await p.locator("#state option").count()) === 38, "checkout state list: 36 states + FCT + placeholder");
  const pick = async (st) => { await p.selectOption("#state", st); await p.waitForTimeout(700); return p.locator("aside").innerText(); };
  let t = await pick("Lagos"); ok(t.includes("3,500") && t.includes("1–2 working days") && t.includes("33,500"), "Lagos: fee ₦3,500 and delivery time shown; order total ₦33,500");
  ok(/Pay now for products\s*₦30,000/.test(t), "amount to pay now is the product subtotal only");
  t = await pick("Ogun"); ok(t.includes("4,000"), "changing state updates fee (Ogun ₦4,000)");
  t = await pick("FCT (Abuja)"); ok(t.includes("6,000"), "FCT fee ₦6,000");
  t = await pick("Kano"); ok(/Not available/.test(t) && await p.getByRole("button", { name: "Place order" }).isDisabled(), "disabled state (Kano) blocks checkout");
  t = await pick("Abia"); ok(/Not available/.test(t) && await p.getByRole("button", { name: "Place order" }).isDisabled(), "unconfigured state (Abia) blocks checkout");
  await pick("Lagos");
  await p.fill("#name", "Ada Test"); await p.fill("#phone", "0803 123 4567"); await p.fill("#city", ""); await p.fill("#address", "12 Test Street, Allen Avenue");
  await p.getByRole("button", { name: "Place order" }).click();
  ok(await p.locator("#city[aria-invalid=true]").count() === 1 && (await p.inputValue("#name")) === "Ada Test", "validation error shown beside field; other answers kept");
  await p.fill("#city", "Ikeja");
  await p.screenshot({ path: path.join(SHOTS, "mobile-checkout.png"), fullPage: true });
  await p.getByRole("button", { name: "Place order" }).click();
  await p.waitForURL(/\/order\/WX/); await p.waitForLoadState("networkidle");
  orderNumber = p.url().match(/WX\d{6}-[A-Z0-9]{5}/)[0];
  order.url = p.url().replace(B, "").replace("&new=1", "");
  const body = await p.locator("main").innerText();
  ok(body.includes("2930024274") && /Product payment\s*₦30,000/.test(body), "bank transfer instructions show the product amount");
  ok(/Delivery to Lagos: ₦3,500/.test(body) && /separate payment/i.test(body), "order page shows delivery fee as a separate payment");
  const o = q1("SELECT * FROM orders WHERE number=?", orderNumber);
  ok(o.subtotal === 30000 && o.delivery_fee === 3500 && o.total === 33500 && o.delivery_fee_source === "state_settings" && o.delivery_eta === "1–2 working days", "order stores delivery fee snapshot from settings");
  ok(o.payment_status === "pending_payment" && o.delivery_payment_status === "pending", "product payment pending, delivery payment pending (separate)");
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "stock reserved by order (5 → 3)");
  ok(q1("SELECT COUNT(*) c FROM stock_movements WHERE order_id=? AND reason='order_reserved'", o.id).c === 1, "reservation recorded in stock history");
  await p.screenshot({ path: path.join(SHOTS, "mobile-order.png"), fullPage: true });
  // receipt submission does not mark paid
  await p.click("text=I have paid"); await p.fill("#payerName", "Ada Test"); await p.fill("#reference", "REF123456");
  await p.click("button:has-text('Submit payment confirmation')"); await p.locator("text=Payment confirmation received").waitFor();
  ok(q1("SELECT payment_status s FROM orders WHERE number=?", orderNumber).s === "awaiting_verification", "receipt submission → Awaiting Verification, not Paid");
  ok(errs.length === 0, `no browser errors during checkout (${errs.slice(0, 2).join(" | ")})`);
  await ctx.close();
});

await step("checkout API manipulation", async () => {
  let ipn = 10; // each call from a different test address so the per-IP order limit does not interfere
  const api = (data) => anon.request.post(B + "/api/orders", { headers: { origin: B, "x-forwarded-for": `10.9.0.${ipn++}` }, data });
  const base = { name: "Api Test", phone: "08035556666", city: "Ikeja", address: "5 Example Street, Ikeja", items: [{ variantId: q1("SELECT id FROM variants WHERE sku='WX-TRIM-DOWN-COFFEE-1MONTH'").id, qty: 1 }] };
  const r1 = await (await api({ ...base, state: "Lagos", deliveryFee: 1, delivery_fee: 1, total: 1, subtotal: 1 })).json();
  const o1 = q1("SELECT subtotal, delivery_fee FROM orders WHERE number=?", r1.number);
  ok(o1.subtotal === 12500 && o1.delivery_fee === 3500, "browser-supplied prices/fees ignored; server fee used");
  const r2 = await api({ ...base, state: "Kano" }); ok(r2.status() === 400 && /not delivering|not available/i.test(JSON.stringify(await r2.json())), "API rejects disabled state");
  const r3 = await api({ ...base, state: "Abia" }); ok(r3.status() === 400, "API rejects unconfigured state");
  const r4 = await api({ ...base, state: "Atlantis" }); ok(r4.status() === 400, "API rejects unknown state");
  const key = "e2eDuplicateKey" + Date.now();
  const [a, b2] = await Promise.all([api({ ...base, state: "Ogun", clientKey: key }), api({ ...base, state: "Ogun", clientKey: key })]);
  const ja = await a.json(), jb = await b2.json();
  ok(ja.number && ja.number === jb.number && q1("SELECT COUNT(*) c FROM orders WHERE client_key=?", key).c === 1, "repeated submission creates one order");
});

// ---------------- admin order lifecycle ----------------
await step("admin order lifecycle", async () => {
  const o = q1("SELECT * FROM orders WHERE number=?", orderNumber);
  // fee change in settings must not change existing order
  await admin.goto(B + "/admin/delivery"); await admin.fill('input[name="fee_Lagos"]', "9999"); await go(admin, admin.locator("button:has-text('Save delivery settings')").first());
  ok(q1("SELECT delivery_fee f FROM orders WHERE id=?", o.id).f === 3500, "changing Lagos fee later does not change the existing order");
  await admin.goto(B + `/admin/orders/${o.id}`);
  const txt = await admin.locator("main").innerText();
  ok(txt.includes("3,500") && /Delivery settings for Lagos/.test(txt), "admin order shows fee and its source");
  await admin.check("input[name=confirm][value=yes] >> nth=0"); await go(admin, admin.locator("button:has-text('Confirm product payment')").first());
  ok(q1("SELECT payment_status s, delivery_payment_status d FROM orders WHERE id=?", o.id).s === "paid" && q1("SELECT delivery_payment_status d FROM orders WHERE id=?", o.id).d === "pending", "confirming product payment leaves delivery unpaid");
  await admin.selectOption('select[name="status"]', "processing"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(/delivery payment/i.test(await flash(admin)) && q1("SELECT fulfilment_status f FROM orders WHERE id=?", o.id).f !== "processing", "cannot process until delivery payment is confirmed");
  await admin.locator("form:has(button:has-text('Confirm delivery payment')) input[name=confirm]").check(); await go(admin, admin.locator("button:has-text('Confirm delivery payment')").first());
  ok(q1("SELECT delivery_payment_status d FROM orders WHERE id=?", o.id).d === "paid", "delivery payment recorded separately");
  await admin.selectOption('select[name="status"]', "cancelled"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "cancel releases reserved stock (3 → 5)");
  await admin.selectOption('select[name="status"]', "unfulfilled"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "reopening re-reserves stock");
  await admin.selectOption('select[name="status"]', "cancelled"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "second cancel never adds stock twice");
  const csv = await (await admin.request.get(B + "/api/admin/export")).text();
  ok(csv.includes(orderNumber), "order appears in CSV export");
  await admin.screenshot({ path: path.join(SHOTS, "admin-order.png"), fullPage: true });
});

// ---------------- coupons ----------------
const postJ = (u, data, ip) => anon.request.post(B + u, { headers: { origin: B, "x-forwarded-for": ip || `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, data });
const coffee = () => q1("SELECT id FROM variants WHERE sku='WX-TRIM-DOWN-COFFEE-1MONTH'").id;
const orderBase = (phone) => ({ name: "Coupon Tester", phone, city: "Ikeja", address: "7 Coupon Street, Ikeja", state: "Lagos", items: [{ variantId: coffee(), qty: 2 }] });
await step("coupons", async () => {
  const make = async (vals) => {
    await admin.goto(B + "/admin/promotions");
    const f = admin.locator("form").filter({ has: admin.locator("button:has-text('Create coupon')") });
    for (const [k, v] of Object.entries(vals)) {
      if (k === "active") { if (v) await f.locator('input[name="active"]').check(); continue; }
      if (k === "discountType") { await f.locator('select[name="discountType"]').selectOption(v); continue; }
      await f.locator(`input[name="${k}"]`).evaluate((el) => { el.removeAttribute("max"); el.removeAttribute("min"); }); // test the server-side checks
      await f.locator(`input[name="${k}"]`).fill(String(v));
    }
    await go(admin, f.locator("button:has-text('Create coupon')"));
    return flash(admin);
  };
  ok(/Coupon saved/.test(await make({ code: "save10", discountType: "percent", discountValue: 10, active: true })), "owner creates a percentage coupon (code upper-cased)");
  await make({ code: "FIXED500", discountType: "fixed", discountValue: 500, minimumOrder: 100000, active: true });
  await make({ code: "OLDCODE", discountType: "fixed", discountValue: 500, expiresAt: "2020-01-31", active: true });
  await make({ code: "OFFCODE", discountType: "fixed", discountValue: 500 });
  await make({ code: "COMBOONLY", discountType: "percent", discountValue: 20, categorySlugs: "combos", active: true });
  await make({ code: "ONEUSE", discountType: "fixed", discountValue: 1000, usageLimit: 1, customerLimit: 5, active: true });
  ok(/percentage from 1 to 100/.test(await make({ code: "BAD150", discountType: "percent", discountValue: 150, active: true })), "percentage above 100 rejected");
  ok(/already in use/.test(await make({ code: "SAVE10", discountType: "fixed", discountValue: 5, active: true })), "duplicate coupon code rejected");
  ok(q1("SELECT code FROM coupons WHERE code='SAVE10'") && !q1("SELECT 1 x FROM coupons WHERE code='BAD150'"), "coupons stored; invalid one not stored");
  const v = async (code, items = [{ variantId: coffee(), qty: 2 }]) => (await postJ("/api/coupons/validate", { code, phone: "08030000001", items })).json();
  const r1 = await v("save10"); ok(r1.discountAmount === 2500 && r1.code === "SAVE10", "SAVE10 gives 10% of ₦25,000 = ₦2,500");
  ok(/at least ₦100,000/.test((await v("FIXED500")).error || ""), "minimum order enforced");
  ok(/expired/.test((await v("OLDCODE")).error || ""), "expired coupon rejected");
  ok(/not available/.test((await v("OFFCODE")).error || ""), "inactive coupon rejected");
  ok(/not available/.test((await v("NOPE")).error || ""), "unknown coupon rejected");
  ok(/does not apply/.test((await v("COMBOONLY")).error || ""), "category-restricted coupon rejected for non-combo cart");
  // order with coupon; browser-supplied discount fields are ignored
  const r = await (await postJ("/api/orders", { ...orderBase("08030000001"), couponCode: "save10", discountAmount: 20000, subtotal: 1, total: 1 })).json();
  const o = q1("SELECT * FROM orders WHERE number=?", r.number);
  ok(o && o.subtotal === 22500 && o.discount_amount === 2500 && o.coupon_code === "SAVE10" && o.delivery_fee === 9999 && o.total === 22500 + 9999, "order: ₦25,000 − ₦2,500 = ₦22,500 product payment; current Lagos fee ₦9,999 kept separate (manipulated fields ignored)");
  ok(q1("SELECT SUM(discount_amount) s FROM order_items WHERE order_id=?", o.id).s === 2500, "discount allocated to order lines");
  ok(q1("SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id=?", o.id).c === 1, "redemption recorded");
  const again = await postJ("/api/orders", { ...orderBase("0803 000 0001"), couponCode: "SAVE10" });
  ok(again.status() === 400 && /already used/.test(JSON.stringify(await again.json())), "per-customer limit enforced on the same phone");
  const u1 = await postJ("/api/orders", { ...orderBase("08030000002"), couponCode: "ONEUSE" }); const u2 = await postJ("/api/orders", { ...orderBase("08030000003"), couponCode: "ONEUSE" });
  ok(u1.status() === 200 && u2.status() === 400, "total usage limit enforced");
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const p = await ctx.newPage();
  await p.goto(B + "/product/trim-down-coffee"); await p.getByRole("button", { name: /Add to cart/ }).first().click(); await p.getByRole("dialog", { name: "Your cart" }).waitFor();
  await p.goto(B + "/checkout"); await p.waitForLoadState("networkidle");
  await p.fill("#couponCode", "save10"); await p.getByRole("button", { name: "Apply" }).click(); await p.locator("text=Coupon applied").waitFor();
  const aside = await p.locator("aside").innerText();
  ok(/Coupon \(SAVE10\)\s*−₦1,250/.test(aside) && /Pay now for products\s*₦11,250/.test(aside), "checkout shows coupon discount and reduced product payment");
  await p.screenshot({ path: path.join(SHOTS, "mobile-checkout-coupon.png"), fullPage: true });
  await ctx.close();
  order.couponOrder = r.number;
  // delete: used coupon is only deactivated, unused one is deleted
  await admin.goto(B + "/admin/promotions");
  await go(admin, admin.locator("article", { hasText: "SAVE10 ·" }).locator("button:has-text('Deactivate and preserve history')"));
  ok(q1("SELECT active FROM coupons WHERE code='SAVE10'").active === 0, "used coupon deactivated, history kept");
  await go(admin, admin.locator("article", { hasText: "OFFCODE ·" }).locator("button:has-text('Delete coupon')"));
  ok(!q1("SELECT 1 x FROM coupons WHERE code='OFFCODE'"), "unused coupon deleted");
});

// ---------------- reviews and testimonials ----------------
await step("reviews", async () => {
  const num = order.couponOrder; const o = q1("SELECT * FROM orders WHERE number=?", num);
  const review = (data) => postJ("/api/reviews", { product: "trim-down-coffee", orderNumber: num, phone: "08030000001", rating: 5, review: "Arrived quickly and well packed.", ...data });
  ok((await review({})).status() === 400, "review rejected while the order is unpaid");
  await admin.goto(B + `/admin/orders/${o.id}`);
  await admin.check("input[name=confirm][value=yes] >> nth=0"); await go(admin, admin.locator("button:has-text('Confirm product payment')").first());
  ok(q1("SELECT payment_status s FROM orders WHERE id=?", o.id).s === "paid", "admin confirms product payment for the coupon order");
  ok(q1("SELECT purchase_event_status s FROM orders WHERE id=?", o.id).s === "not_configured", "Purchase event path runs only on confirmation (no Meta credentials in tests)");
  ok((await review({ phone: "08039999999" })).status() === 400, "review rejected with a phone that does not match the order");
  ok((await review({ product: "tummy-balance" })).status() === 400, "review rejected for a product not in the order");
  ok((await review({})).status() === 200, "verified buyer review accepted");
  ok((await review({})).status() === 409, "second review for the same order and product rejected");
  ok(!(await (await anon.request.get(B + "/product/trim-down-coffee")).text()).includes("Arrived quickly"), "pending review not public");
  await admin.goto(B + "/admin/reviews");
  await go(admin, admin.locator("article", { hasText: "Arrived quickly" }).locator("button:has-text('Approve')"));
  ok((await (await anon.request.get(B + "/product/trim-down-coffee")).text()).includes("Arrived quickly"), "approved review shown on product page");
  await go(admin, admin.locator("article", { hasText: "Arrived quickly" }).locator("button:has-text('Reject')"));
  ok(!(await (await anon.request.get(B + "/product/trim-down-coffee")).text()).includes("Arrived quickly"), "rejected review hidden again");
  ok(q1("SELECT COUNT(*) c FROM testimonials").c === 0 && q1("SELECT COUNT(*) c FROM product_reviews WHERE id NOT IN (SELECT id FROM product_reviews WHERE order_id=?)", o.id).c === 0, "no seeded reviews or testimonials");
  const tf = admin.locator("form").filter({ has: admin.locator("button:has-text('Add testimonial')") });
  await tf.locator('input[name="customerName"]').fill("Test Customer"); await tf.locator('textarea[name="quote"]').fill("Test statement entered by the automated test.");
  await go(admin, tf.locator("button:has-text('Add testimonial')"));
  ok(!(await (await anon.request.get(B + "/")).text()).includes("Test statement entered"), "draft testimonial hidden from homepage");
  await go(admin, admin.locator("article", { hasText: "Test statement entered" }).locator("button:has-text('Publish')"));
  ok((await (await anon.request.get(B + "/")).text()).includes("Test statement entered"), "published testimonial shown on homepage");
});

// ---------------- notifications, activity, analytics ----------------
await step("notifications and activity", async () => {
  const orders = q1("SELECT COUNT(*) c FROM orders").c;
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE type='new_order'").c === orders, "one new-order notification per order (duplicate submission did not add another)");
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE type='payment_update'").c >= 1, "payment confirmation notification created");
  // low stock: threshold 2 on the oil, stock 5 now
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  const row = admin.locator("tr", { hasText: "WX-GET-SNATCHED-OIL-1MONTH" });
  await row.locator('select[name="kind"]').selectOption("decrease"); await row.locator('input[name="qty"]').fill("3"); await go(admin, row.locator("button:has-text('Save')").last());
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("decrease"); await row.locator('input[name="qty"]').fill("1"); await go(admin, row.locator("button:has-text('Save')").last());
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE type='low_stock' AND title LIKE '%low%'").c === 1, "low-stock notification raised once for the episode (2 then 1 left)");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("decrease"); await row.locator('input[name="qty"]').fill("1"); await go(admin, row.locator("button:has-text('Save')").last());
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE type='low_stock' AND title LIKE '%out of stock%'").c === 1, "out-of-stock notification raised at 0");
  const unread = q1("SELECT COUNT(*) c FROM admin_notifications WHERE read_at IS NULL").c;
  await admin.goto(B + "/admin/notifications");
  ok((await admin.locator('nav[aria-label="Admin"]').innerText()).includes(String(unread)), "unread badge matches database count");
  await go(admin, admin.locator("button:has-text('Mark read')").first());
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE read_at IS NULL").c === unread - 1, "mark one notification read");
  await go(admin, admin.locator("button:has-text('Mark all read')"));
  ok(q1("SELECT COUNT(*) c FROM admin_notifications WHERE read_at IS NULL").c === 0, "mark all read");
  const acts = qa("SELECT DISTINCT action FROM admin_activity").map((r) => r.action);
  ok(["adjust_stock", "save_delivery", "payment_verified", "fulfilment_cancelled"].every((x) => acts.includes(x)) && qa("SELECT actor FROM admin_activity").every((r) => r.actor === "owner@test.local"), `activity log records actor and actions (${acts.length} kinds)`);
  await admin.goto(B + "/admin/activity?q=adjust_stock");
  ok((await admin.locator("tbody tr").count()) >= 3 && !(await admin.locator("tbody").innerText()).includes("save_delivery"), "activity search filters");
  ok((await admin.locator("form[action] button:has-text('Delete'), button:has-text('Edit')").count()) === 0, "activity log has no edit or delete controls");
});

await step("analytics", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const exp = q1(`SELECT COALESCE(SUM(subtotal),0) r, COUNT(*) n, COALESCE(SUM(discount_amount),0) disc FROM orders WHERE payment_status='paid' AND fulfilment_status!='cancelled'`);
  const del = q1(`SELECT COALESCE(SUM(delivery_fee),0) d FROM orders WHERE delivery_payment_status='paid' AND fulfilment_status!='cancelled'`).d;
  await admin.goto(B + `/admin/analytics?from=${today}&to=${today}`);
  const t = await admin.locator("main, body").first().innerText();
  const n = (x) => "₦" + Number(x).toLocaleString("en-NG");
  ok(new RegExp(`Confirmed product revenue\\s+${n(exp.r)}`).test(t) && exp.r === 22500, `confirmed revenue counts only paid, non-cancelled orders (${n(exp.r)})`);
  ok(new RegExp(`Delivery fees collected\\s+${n(del)}`).test(t), `delivery collections shown separately (${n(del)})`);
  ok(new RegExp(`Coupon discounts given\\s+${n(exp.disc)}`).test(t), "discounts reported");
  ok(t.includes("Lagos") && t.includes("Trim Down Coffee"), "state and product reports list paid sales");
  const csv = await (await admin.request.get(B + `/api/admin/analytics/export?from=${today}&to=${today}`)).text();
  ok(csv.includes('"Confirmed product revenue","","22500"'), "analytics CSV export");
  ok((await anon.request.get(B + "/api/admin/analytics/export")).status() === 403, "analytics export blocked when signed out");
  await admin.goto(B + "/admin/analytics?from=2020-01-01&to=2020-01-02");
  ok(/Confirmed product revenue\s+₦0\b/.test(await admin.locator("body").innerText()), "date filter excludes orders outside the range");
});

await step("coupon release on cancel", async () => {
  const o = q1("SELECT * FROM orders WHERE number=?", order.couponOrder);
  const setStatus = async (st) => { await admin.goto(B + `/admin/orders/${o.id}`); await admin.selectOption('select[name="status"]', st); await go(admin, admin.locator("button:has-text('Update status')").first()); };
  await setStatus("cancelled");
  ok(q1("SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id=?", o.id).c === 0 && q1("SELECT discount_amount d FROM orders WHERE id=?", o.id).d === 2500, "cancelling frees the coupon use and keeps the discount on record");
  await setStatus("unfulfilled");
  ok(q1("SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id=?", o.id).c === 1, "reopening counts the coupon use again");
  const spoof = await anon.request.post(B + "/api/orders", { headers: { origin: B, "x-forwarded-for": "1.2.3.4, 10.9.9.9" }, data: {} });
  ok(spoof.status() === 400, "forwarded-for handling accepts proxy chain");
});

await step("staff permissions and customer privacy", async () => {
  await admin.goto(B + "/admin/users");
  const f = admin.locator("form").filter({ has: admin.locator("button:has-text('Add user')") });
  await f.locator('input[name="name"]').fill("Staff Tester"); await f.locator('input[name="email"]').fill("staff@test.local"); await f.locator('input[name="password"]').fill("staff-password-123");
  await go(admin, f.locator("button:has-text('Add user')"));
  const sp = await (await browser.newContext()).newPage();
  await sp.goto(B + "/admin/login"); await sp.fill("#email", "staff@test.local"); await sp.fill("#password", "staff-password-123"); await sp.click("button:has-text('Sign in')"); await sp.waitForURL(B + "/admin");
  for (const u of ["/admin/promotions", "/admin/analytics", "/admin/activity", "/admin/delivery", "/admin/inventory", "/admin/media", "/admin/users", "/admin/settings"]) {
    await sp.goto(B + u); ok(/denied=1/.test(sp.url()), `staff blocked from ${u}`);
  }
  for (const u of ["/api/admin/export", "/api/admin/analytics/export", "/api/admin/delivery-export"]) ok([403, 404].includes((await sp.request.get(B + u)).status()), `staff blocked from ${u}`);
  await sp.goto(B + "/admin/orders"); ok(sp.url().endsWith("/admin/orders"), "staff can open orders");
  await sp.goto(B + "/admin/reviews"); ok(!(await sp.locator("text=Add testimonial").count()), "staff cannot manage testimonials");
  const nav = await sp.locator('nav[aria-label="Admin"]').innerText();
  ok(!/Coupons|Analytics|Activity log/.test(nav), "owner-only links hidden from staff");
  ok(q1("SELECT COUNT(*) c FROM admin_activity WHERE action='add_user' AND entity_id='staff@test.local'").c === 1, "user creation logged");
  const any = q1("SELECT number FROM orders LIMIT 1").number;
  const pub = await (await anon.request.get(B + `/order/${any}`)).text();
  ok(pub.includes("Order not found") && !pub.includes("Coupon Street") && !pub.includes("Allen Avenue"), "order page without the private link shows no customer data");
  ok((await anon.request.get(B + `/order/${any}?t=wrong-token-value`)).status() === 200 && !(await (await anon.request.get(B + `/order/${any}?t=wrong-token-value`)).text()).includes("Ikeja"), "wrong order token reveals nothing");
});

await step("meta tracking regression", async () => {
  const src = (f) => fs.readFileSync(path.join(FIX, "..", f), "utf8");
  ok(/track\("InitiateCheckout"/.test(src("src/components/CheckoutForm.tsx")) && /track\("AddToCart"/.test(src("src/components/CartProvider.tsx")) && /track\("PageView"\)/.test(src("src/components/pixel.tsx")), "Pixel event names unchanged (PageView, AddToCart, InitiateCheckout)");
  ok(/event_name: "Purchase"/.test(src("src/lib/meta.ts")) && /sendStorePurchase\(/.test(src("src/app/admin/actions.ts")), "CAPI Purchase still sent only from payment confirmation");
  ok(metaRequests.length === 0, `no requests to Meta during the tests (${metaRequests.length})`);
});

// ---------------- crawl: console errors, failed requests, broken images and links ----------------
await step("crawl", async () => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const pg = await ctx.newPage();
  const consoleErrors = [], failed = [], broken = [];
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${pg.url()}: ${m.text().slice(0, 160)}`); });
  pg.on("pageerror", (e) => consoleErrors.push(`${pg.url()}: ${e.message.slice(0, 160)}`));
  pg.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(B)) failed.push(`${r.status()} ${r.url().replace(B, "")}`); });
  const seen = new Set(); const queue = ["/"]; const links = new Set();
  while (queue.length && seen.size < 40) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    await pg.goto(B + u, { waitUntil: "networkidle" });
    for (const img of await pg.locator("img").all()) { await img.scrollIntoViewIfNeeded().catch(() => {}); }
    await pg.waitForTimeout(300);
    broken.push(...(await pg.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("loading") !== "lazy").map((i) => location.pathname + " → " + i.currentSrc))));
    const hrefs = await pg.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")));
    for (const h of hrefs) { const clean = h.split("#")[0]; if (!clean || clean.startsWith("/admin") || clean.startsWith("/api")) continue; links.add(clean); if (!/[?]/.test(clean) && !seen.has(clean)) queue.push(clean); }
  }
  const badLinks = [];
  for (const l of links) { const r = await anon.request.get(B + l, { maxRedirects: 5 }); if (r.status() >= 400) badLinks.push(`${r.status()} ${l}`); }
  ok(consoleErrors.length === 0, `no console errors or hydration errors on ${seen.size} store pages${consoleErrors.length ? " — " + consoleErrors.slice(0, 3).join(" | ") : ""}`);
  ok(failed.length === 0, `no failed requests${failed.length ? " — " + [...new Set(failed)].slice(0, 5).join(", ") : ""}`);
  ok(broken.length === 0, `no broken images${broken.length ? " — " + broken.slice(0, 5).join(", ") : ""}`);
  ok(badLinks.length === 0, `all ${links.size} internal links resolve${badLinks.length ? " — " + badLinks.slice(0, 5).join(", ") : ""}`);
  // admin pages render without server errors
  const adminPages = ["/admin", "/admin/orders", "/admin/notifications", "/admin/products", "/admin/categories", "/admin/media", "/admin/inventory", "/admin/delivery", "/admin/promotions", "/admin/reviews", "/admin/customers", "/admin/analytics", "/admin/messages", "/admin/settings", "/admin/users", "/admin/activity"];
  const adminBad = [];
  for (const u of adminPages) { const r = await admin.goto(B + u); if (!r || r.status() >= 400 || /Application error|Internal Server Error/.test(await admin.content())) adminBad.push(u); }
  ok(adminBad.length === 0, `all ${adminPages.length} admin pages load${adminBad.length ? " — " + adminBad.join(", ") : ""}`);
  await ctx.close();
});

// ---------------- responsive ----------------
await step("responsive", async () => {
  const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
  const pub = ["/", "/shop", "/category/combos", "/category/individual", "/product/tummy-balance", "/product/1-month-combo-set", "/shipping", "/cart", "/checkout", "/faq", "/contact", "/about", ...(order.url ? [order.url] : [])];
  const adm = ["/admin", "/admin/products", "/admin/inventory", "/admin/delivery", "/admin/media", "/admin/orders", "/admin/categories", "/admin/promotions", "/admin/reviews", "/admin/analytics", "/admin/notifications", "/admin/activity"];
  const cookies = await admin.context().cookies();
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    await ctx.addCookies(cookies);
    const pg = await ctx.newPage();
    const bad = [], small = [];
    for (const u of [...pub, ...adm]) {
      await pg.goto(B + u, { waitUntil: "networkidle" });
      const [sw, iw] = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      if (sw > iw + 1) bad.push(`${u}(${sw})`);
      if (w <= 430 && !u.startsWith("/admin")) {
        const tiny = await pg.evaluate(() => [...document.querySelectorAll("main button, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main select, header button")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36 && getComputedStyle(e).visibility !== "hidden"; })
          .map((e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("name") || e.tagName).trim().slice(0, 30)));
        if (tiny.length) small.push(`${u}: ${[...new Set(tiny)].slice(0, 3).join("/")}`);
        const off = await pg.evaluate(() => [...document.querySelectorAll("main button, main a.btn, header button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1); }).length);
        if (off) bad.push(`${u}: ${off} control(s) outside the screen`);
      }
    }
    if (w <= 430) ok(small.length === 0, `${w}px: store tap targets at least 36px tall${small.length ? " — " + small.slice(0, 4).join("; ") : ""}`);
    ok(bad.length === 0, `${w}px: no horizontal page overflow on ${pub.length + adm.length} pages${bad.length ? " — " + bad.join(", ") : ""}`);
    if ([320, 768, 1440].includes(w)) { await pg.goto(B + "/"); await pg.screenshot({ path: path.join(SHOTS, `home-${w}.png`) }); }
    await ctx.close();
  }
});

await browser.close();
fs.writeFileSync(path.join(SHOTS, "results.txt"), results.map((r) => r.join("  ")).join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
