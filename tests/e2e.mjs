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
const flash = async (p) => (await p.locator('[role=status]').first().textContent({ timeout: 8000 }).catch(() => "")) || "";

const browser = await chromium.launch();
const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const anon = await browser.newContext();

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
  ok(await admin.locator("text=not correct").isVisible({ timeout: 8000 }), "wrong password rejected");
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
  await admin.click("button:has-text('Save delivery settings')");
  const m = await flash(admin); ok(/Abia/.test(m), "switched-on state without a fee is reported and stays unavailable");
  const lag = q1("SELECT * FROM delivery_zones WHERE state='Lagos'");
  ok(lag.fee === 3500 && lag.active === 1 && lag.eta === "1–2 working days", "Lagos fee, status and delivery time saved");
  ok(q1("SELECT active FROM delivery_zones WHERE state='Abia'").active === 0, "Abia without fee is stored as unavailable");
  // bulk
  await admin.goto(B + "/admin/delivery");
  for (const st of ["Oyo", "Osun"]) await admin.check(`input[name="states"][value="${st}"]`);
  await admin.selectOption('select[name="op"]', "fee"); await admin.fill('input[name="bulkFee"]', "4500");
  await admin.click("button:has-text('Apply to ticked states')");
  ok(qa("SELECT fee, active FROM delivery_zones WHERE state IN ('Oyo','Osun')").every((r) => r.fee === 4500 && r.active === 1), "bulk update sets fee for several states");
  // export
  const csv = await (await admin.request.get(B + "/api/admin/delivery-export")).text();
  const lines = csv.trim().split(/\r?\n/);
  ok(lines.length === 38 && /Lagos,3500,yes/.test(csv), "delivery CSV export has header + 37 rows");
  // import: bad file shows problems, saves nothing
  const bad = path.join(SHOTS, "bad.csv"); fs.writeFileSync(bad, "State,Fee,Enabled,ETA,Note\nEkiti,abc,yes,,\nAtlantis,100,yes,,\n");
  await admin.setInputFiles('input[name="file"]', bad); await admin.click("button:has-text('Preview import')");
  ok(await admin.locator("text=Fix these problems").isVisible({ timeout: 8000 }), "import preview reports invalid rows");
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Ekiti'").fee === null, "invalid import saves nothing");
  const good = path.join(SHOTS, "good.csv"); fs.writeFileSync(good, "State,Fee,Enabled,ETA,Note\nEkiti,5000,yes,3–5 working days,via park\n");
  await admin.goto(B + "/admin/delivery");
  await admin.setInputFiles('input[name="file"]', good); await admin.click("button:has-text('Preview import')");
  await admin.click("button:has-text('Save these 1 states')");
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Ekiti'").fee === 5000, "valid import applied after preview");
  ok(q1("SELECT fee FROM delivery_zones WHERE state='Lagos'").fee === 3500, "states missing from the import are unchanged");
  await admin.screenshot({ path: path.join(SHOTS, "admin-delivery.png"), fullPage: true });
});

// ---------------- inventory ----------------
const oil = q1("SELECT id FROM variants WHERE sku='WX-GET-SNATCHED-OIL-1MONTH'").id;
await step("inventory", async () => {
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  const row = admin.locator("tr", { hasText: "WX-GET-SNATCHED-OIL-1MONTH" });
  await row.locator('input[name="qty"]').fill("3"); await row.locator("button:has-text('Save')").last().click();
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "opening stock set to 3");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("increase"); await row.locator('input[name="qty"]').fill("2"); await row.locator("button:has-text('Save')").last().click();
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "stock increase recorded (5)");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('select[name="kind"]').selectOption("decrease"); await row.locator('input[name="qty"]').fill("99"); await row.locator("button:has-text('Save')").last().click();
  ok(/Only 5 in stock/.test(await flash(admin)), "cannot remove more stock than exists");
  await admin.goto(B + "/admin/inventory?q=GET-SNATCHED");
  await row.locator('input[name="threshold"]').fill("2"); await row.locator("form:has(input[name=threshold]) button").click();
  ok(q1("SELECT low_stock_threshold t FROM variants WHERE id=?", oil).t === 2, "low-stock threshold saved");
  ok(q1("SELECT COUNT(*) c FROM stock_movements WHERE variant_id=?", oil).c >= 2, "stock changes written to movement history");
  await admin.goto(B + "/admin/inventory?status=untracked");
  ok((await admin.locator("text=Not tracked").count()) > 0, "inventory status filter works");
});

// ---------------- media library ----------------
await step("media", async () => {
  await admin.goto(B + "/admin/media");
  await admin.setInputFiles('input[name="images"]', [path.join(FIX, "fixture-product.png"), path.join(FIX, "fixture-not-image.png")]);
  await admin.click("button:has-text('Upload')");
  const m = await flash(admin);
  ok(/1 uploaded/.test(m) && /not a JPG, PNG or WebP/.test(m), "image accepted, fake image rejected by content check");
  const med = q1("SELECT * FROM media WHERE builtin=0 ORDER BY id DESC LIMIT 1");
  ok(!!med && fs.existsSync(path.join(DATA, med.file)) && med.file.startsWith("product-images/"), "upload stored under DATA_DIR/product-images");
  ok((await anon.request.get(B + med.url)).status() === 200, "uploaded image served publicly");
  const card = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  await card.locator('input[name="alt"]').fill("Test pouch on a light background"); await card.locator("button:has-text('Save text')").click();
  ok(q1("SELECT alt FROM media WHERE id=?", med.id).alt === "Test pouch on a light background", "alt text saved");
  const tb = q1("SELECT id FROM products WHERE slug='tummy-balance'").id;
  await admin.goto(B + `/admin/products/${tb}`);
  await admin.selectOption('select[name="mediaId"]', String(med.id)); await admin.click("form:has(select[name=mediaId]) button");
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).includes(med.url), "image added to gallery from library");
  await admin.goto(B + "/admin/media");
  const card2 = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  ok((await card2.locator("text=Delete").count()) === 0, "image in use cannot be deleted");
  // replace the new photo (index 1) with a second upload
  await admin.goto(B + `/admin/products/${tb}`);
  const idx = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).indexOf(med.url);
  const rep = admin.locator(`form:has(input[name=index][value="${idx}"]):has(input[name=image])`);
  await rep.locator('input[name="image"]').setInputFiles(path.join(FIX, "fixture-product-2.png")); await rep.locator("button:has-text('Replace')").click();
  const imgs = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images);
  ok(!imgs.includes(med.url) && imgs[idx].startsWith("/product-images/"), "gallery image replaced");
  await admin.goto(B + "/admin/media");
  const card3 = admin.locator("article", { has: admin.locator(`img[src="${med.url}"]`) });
  await card3.locator("summary:has-text('Delete')").click(); await card3.locator("button:has-text('Confirm permanent delete')").click();
  ok(!q1("SELECT 1 x FROM media WHERE id=?", med.id) && !fs.existsSync(path.join(DATA, med.file)), "unused image deleted from library and disk");
  // reorder: move replaced image up to main
  await admin.goto(B + `/admin/products/${tb}`);
  await admin.locator(`form:has(input[name=index][value="${idx}"]):has(input[name=op][value=first]) button`).click();
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images)[0] === imgs[idx], "gallery reorder: make main");
  await admin.locator(`form:has(input[name=index][value="0"]):has(input[name=op][value=down]) button`).click();
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images)[1] === imgs[idx], "gallery reorder: move down");
});

// ---------------- products ----------------
await step("products", async () => {
  await admin.goto(B + "/admin/products");
  await admin.fill('input[name="name"]', "E2E Test Product"); await admin.click("button:has-text('Add product')");
  await admin.waitForURL(/\/admin\/products\/\d+/);
  const pid = Number(admin.url().split("/").pop().split("?")[0]);
  ok(q1("SELECT status FROM products WHERE id=?", pid).status === "draft", "new product created as draft");
  await admin.fill('textarea[name="description"]', "First paragraph with **bold**.\n\n- point one\n- point two");
  await admin.click("button:has-text('Save product')");
  ok(/\*\*bold\*\*/.test(q1("SELECT description d FROM products WHERE id=?", pid).d), "product description saved");
  const vform = admin.locator("form:has(input[name=label][placeholder='e.g. Big'])").last();
  await vform.locator('input[name="label"]').fill("Standard"); await vform.locator('input[name="price"]').fill("9000"); await vform.locator("button:has-text('Add option')").click();
  ok(q1("SELECT COUNT(*) c FROM variants WHERE product_id=?", pid).c === 1, "price option added");
  const slug = q1("SELECT slug FROM products WHERE id=?", pid).slug;
  const pv = await admin.goto(B + `/product/${slug}?preview=1`);
  ok(pv.status() === 200 && (await admin.locator("text=Preview: this product is draft").isVisible()), "admin can preview a draft product");
  ok((await admin.locator("article strong, .card strong").filter({ hasText: "bold" }).count()) > 0 && (await admin.locator("li", { hasText: "point one" }).count()) > 0, "formatted description renders bold and lists safely");
  // bulk publish + feature
  await admin.goto(B + "/admin/products?q=e2e");
  await admin.check(`input[name="ids"][value="${pid}"]`); await admin.selectOption('form#bulk-products select[name="op"]', "publish"); await admin.click("form#bulk-products button");
  ok(q1("SELECT status FROM products WHERE id=?", pid).status === "published", "bulk publish");
  ok((await anon.request.get(B + `/product/${slug}`)).status() === 200, "published product visible to customers");
  // duplicate
  await admin.goto(B + "/admin/products?q=e2e");
  await admin.locator("tr", { hasText: "E2E Test Product" }).first().locator("button:has-text('Duplicate')").click();
  await admin.waitForURL(/\/admin\/products\/\d+/);
  const dup = Number(admin.url().split("/").pop().split("?")[0]);
  ok(dup !== pid && q1("SELECT status FROM products WHERE id=?", dup).status === "draft", "duplicate created as draft");
  // archive then delete (never ordered)
  await admin.goto(B + "/admin/products?q=copy");
  await admin.check(`input[name="ids"][value="${dup}"]`); await admin.selectOption('form#bulk-products select[name="op"]', "archive"); await admin.click("form#bulk-products button");
  ok(q1("SELECT status FROM products WHERE id=?", dup).status === "archived", "bulk archive");
  await admin.goto(B + `/admin/products/${dup}`);
  await admin.click("summary:has-text('Delete this product permanently')");
  await admin.fill('input[name="confirm"]', q1("SELECT name FROM products WHERE id=?", dup).name); await admin.click("button:has-text('Delete permanently')");
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
  const api = (data) => anon.request.post(B + "/api/orders", { headers: { origin: B }, data });
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
  await admin.goto(B + "/admin/delivery"); await admin.fill('input[name="fee_Lagos"]', "9999"); await admin.click("button:has-text('Save delivery settings')");
  ok(q1("SELECT delivery_fee f FROM orders WHERE id=?", o.id).f === 3500, "changing Lagos fee later does not change the existing order");
  await admin.goto(B + `/admin/orders/${o.id}`);
  const txt = await admin.locator("main").innerText();
  ok(txt.includes("3,500") && /Delivery settings for Lagos/.test(txt), "admin order shows fee and its source");
  await admin.check("input[name=confirm][value=yes] >> nth=0"); await admin.click("button:has-text('Confirm payment')");
  ok(q1("SELECT payment_status s, delivery_payment_status d FROM orders WHERE id=?", o.id).s === "paid" && q1("SELECT delivery_payment_status d FROM orders WHERE id=?", o.id).d === "pending", "confirming product payment leaves delivery unpaid");
  await admin.selectOption('select[name="status"]', "processing"); await admin.click("button:has-text('Update status')");
  ok(/delivery payment/i.test(await flash(admin)) && q1("SELECT fulfilment_status f FROM orders WHERE id=?", o.id).f !== "processing", "cannot process until delivery payment is confirmed");
  await admin.locator("form:has(button:has-text('Confirm delivery payment')) input[name=confirm]").check(); await admin.click("button:has-text('Confirm delivery payment')");
  ok(q1("SELECT delivery_payment_status d FROM orders WHERE id=?", o.id).d === "paid", "delivery payment recorded separately");
  await admin.selectOption('select[name="status"]', "cancelled"); await admin.click("button:has-text('Update status')");
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "cancel releases reserved stock (3 → 5)");
  await admin.selectOption('select[name="status"]', "unfulfilled"); await admin.click("button:has-text('Update status')");
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "reopening re-reserves stock");
  await admin.selectOption('select[name="status"]', "cancelled"); await admin.click("button:has-text('Update status')");
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 5, "second cancel never adds stock twice");
  const csv = await (await admin.request.get(B + "/api/admin/export")).text();
  ok(csv.includes(orderNumber), "order appears in CSV export");
  await admin.screenshot({ path: path.join(SHOTS, "admin-order.png"), fullPage: true });
});

// ---------------- responsive ----------------
await step("responsive", async () => {
  const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
  const pub = ["/", "/shop", "/category/combos", "/product/tummy-balance", "/cart", "/checkout", "/faq"];
  const adm = ["/admin", "/admin/products", "/admin/inventory", "/admin/delivery", "/admin/media", "/admin/orders", "/admin/categories"];
  const cookies = await admin.context().cookies();
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    await ctx.addCookies(cookies);
    const pg = await ctx.newPage();
    const bad = [];
    for (const u of [...pub, ...adm]) {
      await pg.goto(B + u, { waitUntil: "networkidle" });
      const [sw, iw] = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      if (sw > iw + 1) bad.push(`${u}(${sw})`);
    }
    ok(bad.length === 0, `${w}px: no horizontal page overflow on ${pub.length + adm.length} pages${bad.length ? " — " + bad.join(", ") : ""}`);
    if ([320, 768, 1440].includes(w)) { await pg.goto(B + "/"); await pg.screenshot({ path: path.join(SHOTS, `home-${w}.png`) }); }
    await ctx.close();
  }
});

await browser.close();
fs.writeFileSync(path.join(SHOTS, "results.txt"), results.map((r) => r.join("  ")).join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
