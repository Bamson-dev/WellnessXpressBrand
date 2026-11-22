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
  ok((await anon.request.get(B + "/product/mini-combo-set?preview=1")).status() === 404, "hidden product preview not available to the public");
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
  const dtxt = await admin.locator("main").innerText();
  ok((await admin.locator('input[name^="active_"]').count()) === 37 && (await admin.locator('input[name^="fee_"]').count()) === 0 && /FCT \(Abuja\)\s*₦5,000/.test(dtxt) && /Lagos\s*By area: ₦3,000 to ₦6,000/.test(dtxt) && /Ogun\s*₦5,500/.test(dtxt), "delivery page lists all 37 locations with the approved rates (read-only)");
  ok(q1("SELECT COUNT(*) c FROM delivery_zones").c === 37 && q1("SELECT COUNT(*) c FROM delivery_zones WHERE active=1").c === 37, "all 37 locations covered by default");
  ok(q1("SELECT COUNT(*) c FROM delivery_zones WHERE fee IS NOT NULL").c === 0, "no delivery fee stored");
  await admin.fill('input[name="eta_Lagos"]', "1–2 working days");
  await admin.fill('input[name="internal_Lagos"]', "Rider pickup at 10am");
  await admin.locator('input[name="active_Kano"]').uncheck();
  await go(admin, admin.locator("button:has-text('Save delivery settings')").first());
  ok(/switched off for: Kano/.test(await flash(admin)), "switching a state off is confirmed");
  const lag = q1("SELECT * FROM delivery_zones WHERE state='Lagos'");
  ok(lag.active === 1 && lag.eta === "1–2 working days" && lag.internal_note === "Rider pickup at 10am" && lag.fee === null, "delivery time and internal note saved; no stray ₦0 fee written");
  ok(q1("SELECT COUNT(*) c FROM delivery_zones WHERE fee = 0").c === 0, "saving the page never turns a blank fee into ₦0");
  await admin.goto(B + "/admin/delivery");
  for (const st of ["Oyo", "Osun"]) await admin.check(`input[name="states"][value="${st}"]`);
  await admin.selectOption('select[name="op"]', "eta"); await admin.fill('input[name="bulkEta"]', "2–4 working days");
  await go(admin, admin.locator("button:has-text('Apply to ticked states')").first());
  ok(qa("SELECT eta FROM delivery_zones WHERE state IN ('Oyo','Osun')").every((r) => r.eta === "2–4 working days"), "bulk update sets delivery time");
  const csv = await (await admin.request.get(B + "/api/admin/delivery-export")).text();
  ok(csv.trim().split(/\r?\n/).length === 38 && /State,Fee,Enabled,ETA,Note,Internal note/.test(csv) && /Kano,,no/.test(csv), "delivery CSV export includes fee column and 37 rows");
  const bad = path.join(SHOTS, "bad.csv"); fs.writeFileSync(bad, "State,Fee,Enabled,ETA,Note,Internal note\nEkiti,maybe,,,\nAtlantis,yes,,,\n");
  await admin.setInputFiles('input[name="file"]', bad); await go(admin, admin.locator("button:has-text('Preview import')").first());
  ok(await admin.locator("text=Fix these problems").waitFor({ timeout: 8000 }).then(() => true, () => false), "import preview reports invalid rows");
  ok(q1("SELECT eta FROM delivery_zones WHERE state='Ekiti'").eta === "", "invalid import saves nothing");
  const good = path.join(SHOTS, "good.csv"); fs.writeFileSync(good, "State,Fee,Enabled,ETA,Note\nEkiti,5000,yes,3–5 working days,Pickup at the park\n");
  await admin.goto(B + "/admin/delivery");
  await admin.setInputFiles('input[name="file"]', good); await go(admin, admin.locator("button:has-text('Preview import')").first());
  await go(admin, admin.locator("button:has-text('Save these 1 states')").first());
  const ek = q1("SELECT * FROM delivery_zones WHERE state='Ekiti'");
  ok(ek.eta === "3–5 working days" && ek.note === "Pickup at the park" && ek.fee === 5000, "import applies state delivery fee and notes");
  ok(q1("SELECT eta FROM delivery_zones WHERE state='Lagos'").eta === "1–2 working days", "states missing from the import are unchanged");
  await admin.screenshot({ path: path.join(SHOTS, "admin-delivery.png"), fullPage: true });
});

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
  const rep = admin.locator("div.flex.gap-3", { has: admin.locator(`img[src="${med.url}"]`) }).locator("form", { has: admin.locator('input[name="image"]') });
  await rep.locator('input[name="image"]').setInputFiles(path.join(FIX, "fixture-product-2.png"));
  await Promise.all([admin.waitForURL(/msg=/, { timeout: 30000 }), rep.locator("button:has-text('Replace')").click()]); await admin.waitForLoadState("networkidle");
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
  // Product editor upload: four ~5 MB photos (about 20 MB in one request) must arrive whole.
  ok(!/^\\n$/m.test(await admin.locator("main").innerText()), "product editor shows no stray \\n text");
  const big = [0, 1, 2, 3].map((i) => path.join(SHOTS, `big-${i}.png`));
  {
    const zlib = await import("zlib"); const crypto = await import("crypto");
    const chunk = (t, dta) => { const l = Buffer.alloc(4); l.writeUInt32BE(dta.length); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(t), dta])) >>> 0 : 0); return Buffer.concat([l, Buffer.from(t), dta, c]); };
    const w = 1200, h = 1350; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    for (const f of big) { const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), crypto.randomBytes(w * 3)]))); fs.writeFileSync(f, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 0 })), chunk("IEND", Buffer.alloc(0))])); }
  }
  const before = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).length;
  await admin.goto(B + `/admin/products/${tb}`);
  await admin.setInputFiles('input[aria-label="Upload photos"]', big);
  const [resp] = await Promise.all([admin.waitForResponse((r) => r.url().includes("/api/admin/products/upload-images"), { timeout: 60000 }), admin.locator("button:has-text('Upload photos')").click()]);
  await admin.waitForURL(/msg=/, { timeout: 30000 }).catch(() => {});
  const after = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images);
  ok(resp.status() === 200 && after.length === before + 4, `four 5 MB photos upload in one request (${resp.status()}, ${after.length - before} added)`);
  const last = q1("SELECT original_name n, alt FROM media ORDER BY id DESC LIMIT 1");
  ok(last.n === "big-3.png" && last.alt === "big 3", `uploaded file keeps a readable name and alt text (${last.n} / ${last.alt})`);
  await admin.reload(); ok((await admin.locator(`img[src="${after[after.length - 1]}"]`).count()) === 1, "uploaded photo shows in the editor after refresh");
  ok((await anon.request.get(B + after[after.length - 1])).status() === 200, "uploaded photo is served to the storefront");
  for (let i = 0; i < 4; i++) { await admin.goto(B + `/admin/products/${tb}`); const n = JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).length; await go(admin, admin.locator(`form:has(input[name=index][value="${n - 1}"]):has(input[name=op][value=remove]) button`)); }
  ok(JSON.parse(q1("SELECT images FROM products WHERE id=?", tb).images).length === before, "removing photos from the product works");
  const mediaBefore = q1("SELECT COUNT(*) c FROM media").c, filesBefore = fs.readdirSync(path.join(DATA, "product-images")).length;
  await admin.goto(B + `/admin/products/${tb}`);
  await admin.setInputFiles('input[aria-label="Upload photos"]', [path.join(FIX, "fixture-not-image.png")]);
  await admin.locator("button:has-text('Upload photos')").click();
  ok(await admin.locator("text=not a JPG, PNG or WebP").waitFor({ timeout: 10000 }).then(() => true, () => false), "a fake image is refused with a clear message");
  ok(q1("SELECT COUNT(*) c FROM media").c === mediaBefore && fs.readdirSync(path.join(DATA, "product-images")).length === filesBefore, "a refused upload leaves no database record and no file");
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
  ok(/Add ₦35,000 more for FREE DELIVERY/.test(await p.getByRole("dialog", { name: "Your cart" }).innerText()), "cart drawer shows how much more is needed for free delivery");
  ok(/outfit/i.test(await p.getByRole("dialog", { name: "Your cart" }).locator("h2").evaluate((e) => getComputedStyle(e).fontFamily)), "cart drawer uses the store font");
  ok(/max-age=\d+/.test((await anon.request.get(B + "/")).headers()["strict-transport-security"] || ""), "HSTS header sent");
  await p.goto(B + "/cart"); await p.locator("button[aria-label='Increase quantity']").first().click(); await p.waitForTimeout(600);
  ok((await p.locator("aside").innerText()).includes("30,000"), "cart quantity change updates subtotal (2 × ₦15,000)");
  ok(/Delivery\s*Calculated at checkout/.test(await p.locator("aside").innerText()), "cart says delivery is calculated at checkout");
  await p.goto(B + "/checkout"); await p.waitForLoadState("networkidle");
  ok((await p.locator("#state option").count()) === 37 && !(await p.locator('#state option[value="Kano"]').count()), "checkout lists the 36 covered locations (Kano switched off)");
  const pick = async (st) => { await p.selectOption("#state", st); await p.waitForTimeout(700); return p.locator("aside").innerText(); };
  let t = await pick("Lagos");
  ok(!(await p.getByRole("button", { name: "Place order" }).isEnabled()) && (await p.locator("select#city").count()) === 1, "Lagos: an area must be chosen before the fee is known");
  await p.selectOption("#city", "ikeja"); await p.waitForTimeout(700); t = await p.locator("aside").innerText();
  ok(/Delivery fee \(Lagos\)\s*₦3,000/.test(t) && /Total delivery charge\s*₦3,000/.test(t) && t.includes("1–3 working days"), "Lagos (Ikeja): ₦3,000 delivery, delivery time shown");
  ok(/Total to pay\s*₦33,000/.test(t), "total to pay = products ₦30,000 + delivery ₦3,000");
  await p.selectOption("#city", "lekki phase 1"); await p.waitForTimeout(700);
  ok(/Total to pay\s*₦34,000/.test(await p.locator("aside").innerText()), "Lagos (Lekki Phase 1): ₦4,000 delivery");
  for (const [st, fee, tot] of [["Ogun", "5,500", "35,500"], ["Oyo", "5,500", "35,500"], ["Rivers", "6,500", "36,500"], ["FCT (Abuja)", "5,000", "35,000"], ["Zamfara", "7,500", "37,500"]]) {
    t = await pick(st);
    ok(new RegExp(`Delivery fee \\(${st.replace(/[()]/g, "\\$&")}\\)\\s*₦${fee}`).test(t) && new RegExp(`Total to pay\\s*₦${tot}`).test(t) && await p.getByRole("button", { name: "Place order" }).isEnabled(), `${st}: ₦${fee} delivery, total ₦${tot}, checkout open`);
  }
  await p.fill("#name", "Ada Test"); await p.fill("#phone", "0803 123 4567"); await p.fill("#city", ""); await p.fill("#address", "12 Test Street, Allen Avenue");
  await p.getByRole("button", { name: "Place order" }).click();
  ok(await p.locator("#city[aria-invalid=true]").count() === 1 && (await p.inputValue("#name")) === "Ada Test", "validation error shown beside field; other answers kept");
  await pick("Lagos"); await p.selectOption("#city", "ikeja"); await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(SHOTS, "mobile-checkout.png"), fullPage: true });
  await p.getByRole("button", { name: "Place order" }).click();
  await p.waitForURL(/\/order\/WX/); await p.waitForLoadState("networkidle");
  orderNumber = p.url().match(/WX\d{6}-[A-Z0-9]{5}/)[0];
  order.url = p.url().replace(B, "").replace("&new=1", "");
  const body = await p.locator("main").innerText();
  ok(body.includes("2930024274") && /Total payment\s*₦33,000/.test(body), "bank transfer instructions show the full amount to pay (products + delivery)");
  ok(/Delivery included in your payment/.test(body) && /Delivery \(Lagos\)\s*₦3,000 · Included/.test(body) && /Total to pay WellnessXpressBrand\s*₦33,000/.test(body), "order confirmation shows ₦3,000 delivery included and ₦33,000 total");
  ok(!/paid separately|separate payment/i.test(body), "no separate delivery payment mentioned");
  const o = q1("SELECT * FROM orders WHERE number=?", orderNumber);
  ok(o.subtotal === 30000 && o.delivery_fee === 3000 && o.total === 33000 && o.delivery_fee_source === "included_in_order" && o.delivery_eta === "1–3 working days", "order stores products ₦30,000 + delivery ₦3,000 = ₦33,000");
  ok(o.payment_status === "pending_payment" && o.delivery_payment_status === "not_required", "product payment pending; delivery payment not required");
  ok(q1("SELECT stock FROM variants WHERE id=?", oil).stock === 3, "stock reserved by order (5 → 3)");
  ok(q1("SELECT COUNT(*) c FROM stock_movements WHERE order_id=? AND reason='order_reserved'", o.id).c === 1, "reservation recorded in stock history");
  await p.screenshot({ path: path.join(SHOTS, "mobile-order.png"), fullPage: true });
  // receipt submission does not mark paid
  await p.click("text=I have paid"); await p.fill("#payerName", "Ada Test");
  await p.click("button:has-text('Submit payment confirmation')"); await p.locator("text=Payment confirmation received").waitFor();
  ok(q1("SELECT payment_status s FROM orders WHERE number=?", orderNumber).s === "awaiting_verification", "receipt submission → Awaiting Verification, not Paid");
  ok(errs.length === 0, `no browser errors during checkout (${errs.slice(0, 2).join(" | ")})`);
  await ctx.close();
});

await step("checkout API manipulation", async () => {
  let ipn = 10; // each call from a different test address so the per-IP order limit does not interfere
  const api = (data) => anon.request.post(B + "/api/orders", { headers: { origin: B, "x-forwarded-for": `10.9.0.${ipn++}` }, data });
  const base = { name: "Api Test", phone: "08035556666", city: "Ikeja", address: "5 Example Street, Ikeja", items: [{ variantId: q1("SELECT id FROM variants WHERE sku='WX-TRIM-DOWN-COFFEE-1MONTH'").id, qty: 1 }] };
  const r1 = await (await api({ ...base, state: "Lagos", deliveryFee: 5000, delivery_fee: 5000, total: 1, subtotal: 1 })).json();
  const o1 = q1("SELECT subtotal, delivery_fee, total FROM orders WHERE number=?", r1.number);
  ok(o1.subtotal === 10000 && o1.delivery_fee === 3000 && o1.total === 13000 && r1.deliveryFee === 3000, "browser-supplied prices and delivery fees ignored; server fee stored (Ikeja ₦3,000)");
  const quotes = [];
  for (const st of q1("SELECT group_concat(state, '|') s FROM delivery_zones").s.split("|")) {
    const q = await (await anon.request.post(B + "/api/cart/quote", { headers: { origin: B, "x-forwarded-for": "10.7.7.7" }, data: { items: base.items, state: st } })).json();
    quotes.push([st, q.delivery?.available, q.delivery?.fee]);
  }
  const fees = Object.fromEntries(quotes.map(([st, , fee]) => [st, fee]));
  ok(quotes.length === 37 && quotes.filter(([st]) => !["Kano", "Lagos"].includes(st)).every(([, av, fee]) => av === true && fee >= 5000), "all other covered states quote a configured delivery fee on the server");
  ok(fees["FCT (Abuja)"] === 5000 && fees.Ogun === 5500 && fees.Rivers === 6500 && fees.Zamfara === 7500 && fees["Akwa Ibom"] === 7500, "state fees match the approved rates (Abuja ₦5,000, Ogun ₦5,500, Rivers ₦6,500, Zamfara ₦7,500)");
  ok(quotes.find(([st]) => st === "Lagos")[1] === false, "Lagos without an area has no fee until an area is chosen");
  const qa50 = async (st, qty, city = "") => (await (await anon.request.post(B + "/api/cart/quote", { headers: { origin: B }, data: { items: [{ variantId: base.items[0].variantId, qty }], state: st, city } })).json()).delivery;
  ok((await qa50("Ogun", 5)).fee === 0 && (await qa50("Ogun", 4)).fee === 5500, "₦50,000 threshold: ₦50,000 gets free delivery, ₦40,000 pays ₦5,500");
  ok((await qa50("FCT (Abuja)", 5)).fee === 5000, "Abuja stays ₦5,000 above the threshold");
  ok((await qa50("Lagos", 5, "Ajah")).fee === 0 && (await qa50("Lagos", 1, "Ajah")).fee === 5000 && (await qa50("Lagos", 1, "Atlantis")) && !(await qa50("Lagos", 1, "Atlantis")).available, "Lagos area fees: Ajah ₦5,000, free at ₦50,000, unknown area refused");
  ok(quotes.find(([st]) => st === "Kano")[1] === false, "switched-off state (Kano) is not available");
  for (const st of ["Ogun", "Oyo", "Rivers", "FCT (Abuja)"]) {
    const r = await (await api({ ...base, phone: "0803555" + String(ipn).padStart(4, "0"), state: st, deliveryFee: 9000 })).json();
    const o = q1("SELECT delivery_fee, total, delivery_payment_status d FROM orders WHERE number=?", r.number);
    const want = { Ogun: 5500, Oyo: 5500, Rivers: 6500, "FCT (Abuja)": 5000 }[st];
    ok(o && o.delivery_fee === want && o.total === 10000 + want && o.d === "not_required", `${st}: order total includes the ₦${want} delivery fee`);
  }
  {
    const big = await (await api({ ...base, phone: "08035550050", state: "Ogun", items: [{ variantId: base.items[0].variantId, qty: 5 }] })).json();
    const ob = q1("SELECT subtotal, delivery_fee, total FROM orders WHERE number=?", big.number);
    ok(ob.subtotal === 50000 && ob.delivery_fee === 0 && ob.total === 50000, "₦50,000 order to Ogun: free delivery stored");
  }
  const r2 = await api({ ...base, state: "Kano" }); ok(r2.status() === 400 && /not delivering/i.test(JSON.stringify(await r2.json())), "API rejects a switched-off state");
  const r4 = await api({ ...base, state: "Atlantis" }); ok(r4.status() === 400, "API rejects a location outside Nigeria");
  const key = "e2eDuplicateKey" + Date.now();
  const [a, b2] = await Promise.all([api({ ...base, state: "Ogun", clientKey: key }), api({ ...base, state: "Ogun", clientKey: key })]);
  const ja = await a.json(), jb = await b2.json();
  ok(ja.number && ja.number === jb.number && q1("SELECT COUNT(*) c FROM orders WHERE client_key=?", key).c === 1, "repeated submission creates one order");
});

// ---------------- admin order lifecycle ----------------
await step("admin order lifecycle", async () => {
  const o = q1("SELECT * FROM orders WHERE number=?", orderNumber);
  await admin.goto(B + `/admin/orders/${o.id}`);
  const txt = await admin.locator("main").innerText();
  ok(/Delivery charge\s*₦3,000 · Included in order payment/.test(txt) && !/Confirm delivery payment/.test(txt) && !/Set the delivery fee/.test(txt), "admin order shows delivery included in the payment and no separate delivery payment step");
  ok(/Customer total\s*₦33,000/.test(txt), "admin order shows the ₦33,000 total to verify");
  await admin.check("input[name=confirm][value=yes] >> nth=0"); await go(admin, admin.locator("button:has-text('Confirm product payment')").first());
  ok(q1("SELECT payment_status s FROM orders WHERE id=?", o.id).s === "paid", "admin confirms product payment");
  await admin.selectOption('select[name="status"]', "processing"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT fulfilment_status f FROM orders WHERE id=?", o.id).f === "processing", "paid order can be processed straight away");
  await admin.fill('input[name="courier"]', "GIG Logistics"); await admin.fill('input[name="tracking"]', "GIG-TEST-123");
  await go(admin, admin.locator("button:has-text('Save dispatch details')"));
  const od = q1("SELECT courier, tracking_reference, dispatched_at FROM orders WHERE id=?", o.id);
  ok(od.courier === "GIG Logistics" && od.tracking_reference === "GIG-TEST-123" && od.dispatched_at, "dispatch details saved");
  ok((await (await (await browser.newContext()).request.get(B + `/order/${o.number}?t=${o.access_token}`)).text()).includes("GIG-TEST-123"), "customer order page shows the tracking reference");
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

// ---------------- historical order kept as it was ----------------
await step("historical delivery fee order", async () => {
  const d = new DatabaseSync(path.join(DATA, "store.db"));
  d.prepare(`INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,
    delivery_payment_status,delivery_fee_source,bank_snapshot,tracking,payment_status,created_at) VALUES ('WX200101-OLD01','legacytoken000000000000000000000','Legacy Buyer','2348031112222','','','Ogun','Abeokuta','1 Legacy Road, Abeokuta','',20000,4000,24000,'pending','state_settings','{}','{}','paid','2019-06-01 10:00:00')`).run();
  const id = Number(d.prepare("SELECT id FROM orders WHERE number='WX200101-OLD01'").get().id); d.close();
  const page = await (await anon.request.get(B + "/order/WX200101-OLD01?t=legacytoken000000000000000000000")).text();
  ok(page.includes("Delivery is paid separately") && page.includes("₦4,000") && page.includes("₦24,000"), "pre-policy order still shows its ₦4,000 delivery fee and ₦24,000 total");
  await admin.goto(B + `/admin/orders/${id}`);
  ok((await admin.locator("text=Confirm delivery payment").count()) === 1, "pre-policy order keeps its delivery payment step");
  await admin.selectOption('select[name="status"]', "processing"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(/delivery payment/i.test(await flash(admin)), "pre-policy order still needs its delivery payment before processing");
  const o = q1("SELECT delivery_fee, total FROM orders WHERE id=?", id);
  ok(o.delivery_fee === 4000 && o.total === 24000, "historical totals unchanged");
  // An older unpaid order without a fee: the fee the admin sets is added to the one total the customer pays the store.
  const d2 = new DatabaseSync(path.join(DATA, "store.db"));
  d2.prepare(`INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,
    delivery_payment_status,bank_snapshot,tracking,payment_status,created_at) VALUES ('WX200102-OLD02','legacytoken000000000000000000002','Legacy Two','2348031113333','','','Lagos','Berger','2 Legacy Road, Berger','',12500,NULL,NULL,'not_set','{}','{}','pending_payment','2026-11-18 10:00:00')`).run();
  const id2 = Number(d2.prepare("SELECT id FROM orders WHERE number='WX200102-OLD02'").get().id); d2.close();
  await admin.goto(B + `/admin/orders/${id2}`);
  await admin.fill('input[name="fee"]', "3500"); await go(admin, admin.locator("button:has-text('Save fee')"));
  const o2 = q1("SELECT delivery_fee, total, delivery_fee_source s, delivery_payment_status d FROM orders WHERE id=?", id2);
  ok(o2.delivery_fee === 3500 && o2.total === 16000 && o2.s === "included_in_order" && o2.d === "not_required", "admin-set delivery fee is included in the order total (₦12,500 + ₦3,500 = ₦16,000), no separate delivery payment");
  const page2 = await (await anon.request.get(B + "/order/WX200102-OLD02?t=legacytoken000000000000000000002")).text();
  ok(page2.includes("₦16,000") && page2.includes("Delivery included in your payment") && !page2.includes("paid separately"), "customer sees one total including delivery");
  await admin.goto(B + `/admin/orders/${id2}`);
  await admin.fill("#bundledfee", "4000"); await go(admin, admin.locator("button:has-text('Update fee')"));
  ok(q1("SELECT total FROM orders WHERE id=?", id2).total === 16500, "admin can correct the included delivery fee before payment is confirmed");
  await admin.selectOption('select[name="status"]', "cancelled"); await go(admin, admin.locator("button:has-text('Update status')").first());
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
      if (k === "categorySlugs" || k === "productNames") {
        const box = f.locator("fieldset", { hasText: k === "categorySlugs" ? "limit to these categories" : "Limit to these products" });
        for (const label of String(v).split("|")) { await box.locator('input[type="search"]').fill(label); await box.locator("label", { hasText: label }).first().locator("input").check(); }
        continue;
      }
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
  await make({ code: "COMBOONLY", discountType: "percent", discountValue: 20, categorySlugs: "Combo Sets", active: true });
  ok(q1("SELECT category_slugs c FROM coupons WHERE code='COMBOONLY'").c === '["combos"]', "category picker saves the chosen category");
  await make({ code: "OILONLY", discountType: "fixed", discountValue: 1000, productNames: "Get Snatched Oil", active: true });
  const oilId = q1("SELECT id FROM products WHERE slug='get-snatched-oil'").id;
  ok(q1("SELECT product_ids p FROM coupons WHERE code='OILONLY'").p === `[${oilId}]`, "product picker saves the chosen product");
  await make({ code: "ONEUSE", discountType: "fixed", discountValue: 1000, usageLimit: 1, customerLimit: 5, active: true });
  ok(/percentage from 1 to 100/.test(await make({ code: "BAD150", discountType: "percent", discountValue: 150, active: true })), "percentage above 100 rejected");
  {
    const f = admin.locator("form").filter({ has: admin.locator("button:has-text('Create coupon')") });
    ok(await f.locator('input[name="code"]').inputValue() === "BAD150" && await f.locator('input[name="discountValue"]').inputValue() === "150", "typed coupon values kept after a validation error");
    ok(await f.locator('input[name="discountValue"][aria-invalid="true"]').count() === 1 && /percentage from 1 to 100/.test(await f.locator("[data-field-error]").innerText()), "error shown next to the field");
  }
  ok(/already in use/.test(await make({ code: "SAVE10", discountType: "fixed", discountValue: 5, active: true })), "duplicate coupon code rejected");
  ok(q1("SELECT code FROM coupons WHERE code='SAVE10'") && !q1("SELECT 1 x FROM coupons WHERE code='BAD150'"), "coupons stored; invalid one not stored");
  const v = async (code, items = [{ variantId: coffee(), qty: 2 }]) => (await postJ("/api/coupons/validate", { code, phone: "08030000001", items })).json();
  const r1 = await v("save10"); ok(r1.discountAmount === 2000 && r1.code === "SAVE10", "SAVE10 gives 10% of ₦20,000 = ₦2,000");
  ok(/at least ₦100,000/.test((await v("FIXED500")).error || ""), "minimum order enforced");
  ok(/expired/.test((await v("OLDCODE")).error || ""), "expired coupon rejected");
  ok(/not available/.test((await v("OFFCODE")).error || ""), "inactive coupon rejected");
  ok(/not available/.test((await v("NOPE")).error || ""), "unknown coupon rejected");
  ok(/does not apply/.test((await v("COMBOONLY")).error || ""), "category-restricted coupon rejected for non-combo cart");
  ok(/does not apply/.test((await v("OILONLY")).error || ""), "product-restricted coupon rejected for other products");
  const oilV = q1("SELECT id FROM variants WHERE sku='WX-GET-SNATCHED-OIL-1MONTH'").id;
  ok((await v("OILONLY", [{ variantId: oilV, qty: 1 }, { variantId: coffee(), qty: 1 }])).discountAmount === 1000, "product-restricted coupon applies to the chosen product");
  // order with coupon; browser-supplied discount fields are ignored
  const r = await (await postJ("/api/orders", { ...orderBase("08030000001"), couponCode: "save10", discountAmount: 20000, subtotal: 1, total: 1 })).json();
  const o = q1("SELECT * FROM orders WHERE number=?", r.number);
  ok(o && o.subtotal === 18000 && o.discount_amount === 2000 && o.coupon_code === "SAVE10" && o.delivery_fee === 3000 && o.total === 21000, "order: ₦20,000 − ₦2,000 + ₦3,000 delivery = ₦21,000; manipulated fields ignored");
  ok(q1("SELECT SUM(discount_amount) s FROM order_items WHERE order_id=?", o.id).s === 2000, "discount allocated to order lines");
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
  ok(/Coupon \(SAVE10\)\s*−₦1,000/.test(aside) && /Total to pay\s*₦9,000/.test(aside), "checkout shows coupon discount and reduced product payment");
  // Regression: a coupon that takes the order below ₦50,000 brings the delivery fee back, on screen and in the stored order.
  await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("wx_cart_v2") || "[]"); c[0].qty = 5; localStorage.setItem("wx_cart_v2", JSON.stringify(c)); });
  await p.goto(B + "/checkout"); await p.waitForLoadState("networkidle");
  await p.selectOption("#state", "Ogun"); await p.waitForTimeout(700);
  ok(/Delivery fee \(Ogun\)\s*FREE/.test(await p.locator("aside").innerText()), "₦50,000 cart to Ogun shows free delivery");
  await p.fill("#couponCode", "save10"); await p.getByRole("button", { name: "Apply" }).click(); await p.locator("text=Coupon applied").waitFor(); await p.waitForTimeout(300);
  const a2 = await p.locator("aside").innerText();
  ok(/Delivery fee \(Ogun\)\s*₦5,500/.test(a2) && /Total to pay\s*₦50,500/.test(a2), "after a ₦5,000 coupon the cart is ₦45,000, so Ogun delivery ₦5,500 applies: total ₦50,500");
  const rr = await (await postJ("/api/orders", { name: "Threshold Tester", phone: "08030000077", city: "Abeokuta", address: "9 Threshold Road, Abeokuta", state: "Ogun", couponCode: "save10", items: [{ variantId: coffee(), qty: 5 }] })).json();
  ok(q1("SELECT total FROM orders WHERE number=?", rr.number)?.total === 50500, "stored order matches the checkout total (₦50,500)");
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
  {
    // Regression: undo + re-confirm must not send a second Purchase once one reached Meta.
    const w = new DatabaseSync(path.join(DATA, "store.db")); w.prepare("UPDATE orders SET purchase_event_status='sent', purchase_event_id='pu_1700000000000_keepme01' WHERE id=?").run(o.id); w.close();
    await admin.goto(B + `/admin/orders/${o.id}`);
    await admin.fill("input[name=note][required]", "Testing undo"); await go(admin, admin.locator("button:has-text('Undo payment confirmation')"));
    ok(q1("SELECT payment_status s FROM orders WHERE id=?", o.id).s === "awaiting_verification", "owner can undo a payment confirmation");
    await admin.check("input[name=confirm][value=yes] >> nth=0"); await go(admin, admin.locator("button:has-text('Confirm product payment')").first());
    const pe = q1("SELECT payment_status s, purchase_event_status st, purchase_event_id id FROM orders WHERE id=?", o.id);
    ok(pe.s === "paid" && pe.st === "sent" && pe.id === "pu_1700000000000_keepme01", "re-confirming a payment keeps the original Purchase event (no duplicate)");
  }
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
  const orders = q1("SELECT COUNT(*) c FROM orders WHERE number NOT LIKE 'WX2001%'").c;
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
  const exp = q1(`SELECT COALESCE(SUM(subtotal),0) r, COUNT(*) n, COALESCE(SUM(discount_amount),0) disc FROM orders WHERE payment_status='paid' AND fulfilment_status!='cancelled' AND created_at >= '${today}'`);
  const del = q1(`SELECT COALESCE(SUM(delivery_fee),0) d FROM orders WHERE (delivery_payment_status='paid' OR (delivery_fee_source='included_in_order' AND payment_status='paid')) AND fulfilment_status!='cancelled' AND created_at >= '${today}'`).d;
  await admin.goto(B + `/admin/analytics?from=${today}&to=${today}`);
  const t = await admin.locator("main, body").first().innerText();
  const n = (x) => "₦" + Number(x).toLocaleString("en-NG");
  ok(new RegExp(`Confirmed product revenue\\s+${n(exp.r)}`).test(t) && exp.r === 18000, `confirmed revenue counts only paid, non-cancelled orders (${n(exp.r)})`);
  ok(new RegExp(`Delivery fees collected\\s+${n(del)}`).test(t), `delivery collections shown separately (${n(del)})`);
  ok(new RegExp(`Coupon discounts given\\s+${n(exp.disc)}`).test(t), "discounts reported");
  ok(t.includes("Lagos") && t.includes("Trim Down Coffee"), "state and product reports list paid sales");
  const csv = await (await admin.request.get(B + `/api/admin/analytics/export?from=${today}&to=${today}`)).text();
  ok(csv.includes('"Confirmed product revenue","","18000"'), "analytics CSV export");
  ok(del === 3000, "delivery included in a confirmed payment counts as collected (₦3,000)");
  ok((await anon.request.get(B + "/api/admin/analytics/export")).status() === 403, "analytics export blocked when signed out");
  await admin.goto(B + "/admin/analytics?from=2020-01-01&to=2020-01-02");
  ok(/Confirmed product revenue\s+₦0\b/.test(await admin.locator("body").innerText()), "date filter excludes orders outside the range");
});

await step("coupon release on cancel", async () => {
  const o = q1("SELECT * FROM orders WHERE number=?", order.couponOrder);
  const setStatus = async (st) => { await admin.goto(B + `/admin/orders/${o.id}`); await admin.selectOption('select[name="status"]', st); await go(admin, admin.locator("button:has-text('Update status')").first()); };
  await setStatus("cancelled");
  ok(q1("SELECT COUNT(*) c FROM coupon_redemptions WHERE order_id=?", o.id).c === 0 && q1("SELECT discount_amount d FROM orders WHERE id=?", o.id).d === 2000, "cancelling frees the coupon use and keeps the discount on record");
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
  ok(q1("SELECT permissions p FROM users WHERE email='staff@test.local'").p === '["dashboard","orders"]', "new staff gets only the ticked permissions (dashboard, orders)");
  const sctx = await browser.newContext(); const sp = await sctx.newPage();
  await sp.goto(B + "/admin/login"); await sp.fill("#email", "staff@test.local"); await sp.fill("#password", "staff-password-123"); await sp.click("button:has-text('Sign in')"); await sp.waitForURL(B + "/admin");
  const blocked = ["/admin/promotions", "/admin/analytics", "/admin/activity", "/admin/delivery", "/admin/inventory", "/admin/media", "/admin/users", "/admin/settings", "/admin/invoices", "/admin/customers", "/admin/banners", "/admin/seo", "/admin/products", "/admin/categories", "/admin/reviews", "/admin/notifications", "/admin/messages", "/admin/invoices/1", "/admin/customers/2348030000001", "/admin/banners/new"];
  const leaks = [];
  for (const u of blocked) { await sp.goto(B + u); if (!/denied=1/.test(sp.url())) leaks.push(u); }
  ok(leaks.length === 0, `staff blocked from ${blocked.length} pages without permission${leaks.length ? " — " + leaks.join(", ") : ""}`);
  const apis = ["/api/admin/export", "/api/admin/analytics/export", "/api/admin/delivery-export", "/api/admin/customers-export", "/api/admin/invoices/1", "/api/admin/receipt/1"];
  const apiLeaks = []; for (const u of apis) if (![403, 404].includes((await sp.request.get(B + u)).status())) apiLeaks.push(u);
  ok(apiLeaks.length === 0, `staff blocked from ${apis.length} admin downloads${apiLeaks.length ? " — " + apiLeaks.join(", ") : ""}`);
  const nav = await sp.locator('nav[aria-label="Admin"]').innerText();
  ok(/Orders/.test(nav) && !/Coupons|Analytics|Activity log|Invoices|Customers|Staff|SEO|Banners/.test(nav), "staff sees only permitted menu items");
  const target = q1("SELECT id FROM orders WHERE payment_status != 'paid' AND fulfilment_status != 'cancelled' ORDER BY id DESC LIMIT 1").id;
  await sp.goto(B + `/admin/orders/${target}`);
  ok(sp.url().endsWith(`/admin/orders/${target}`) && (await sp.locator("text=Confirm product payment").count()) === 0 && (await sp.locator("text=Payment verification permission").count()) === 1, "staff with Orders can view an order but sees no payment verification");
  // Forge the owner's payment form directly against the server as staff: the server must refuse.
  await admin.goto(B + `/admin/orders/${target}`);
  // Capture the owner's real server-action request (and stop it), then replay it with the staff session.
  let captured = null;
  await admin.route(`**/admin/orders/${target}`, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) { captured = { headers: req.headers(), body: req.postDataBuffer() }; return route.abort(); }
    return route.continue();
  });
  await admin.locator("form:has(button:has-text('Confirm product payment')) input[name=confirm]").check();
  await admin.locator("button:has-text('Confirm product payment')").click();
  await admin.waitForTimeout(1500); await admin.unroute(`**/admin/orders/${target}`);
  ok(captured && q1("SELECT payment_status s FROM orders WHERE id=?", target).s !== "paid", "owner request captured without being sent");
  const forged = await sp.request.post(B + `/admin/orders/${target}`, { headers: { origin: B, "next-action": captured.headers["next-action"], "content-type": captured.headers["content-type"], accept: "text/x-component" }, data: captured.body, maxRedirects: 0 });
  ok(q1("SELECT payment_status s FROM orders WHERE id=?", target).s !== "paid", `forged payment verification by staff is refused on the server (HTTP ${forged.status()})`);
  // Owner grants Payment verification and Invoices.
  await admin.goto(B + "/admin/users");
  const card = admin.locator("article", { hasText: "staff@test.local" });
  for (const p of ["payments", "invoices"]) await card.locator(`input[name="perms"][value="${p}"]`).check();
  await go(admin, card.locator("button:has-text('Save permissions')"));
  ok(JSON.parse(q1("SELECT permissions p FROM users WHERE email='staff@test.local'").p).sort().join() === "dashboard,invoices,orders,payments", "owner grants permissions");
  await sp.goto(B + "/admin/invoices"); ok(sp.url().endsWith("/admin/invoices"), "granted permission works on the next page load");
  await sp.goto(B + `/admin/orders/${target}`); ok((await sp.locator("text=Confirm product payment").count()) === 1, "staff now sees payment verification");
  await sp.request.post(B + `/admin/orders/${target}`, { headers: { origin: B, "next-action": captured.headers["next-action"], "content-type": captured.headers["content-type"], accept: "text/x-component" }, data: captured.body, maxRedirects: 0 });
  ok(q1("SELECT payment_status s, verified_by v FROM orders WHERE id=?", target).v === "staff@test.local", "the same replayed request works once the permission is granted (control check)");
  ok((await sp.request.get(B + `/api/admin/invoices/${target}`)).headers()["content-type"] === "application/pdf", "staff with Invoices can download a PDF");
  await admin.goto(B + "/admin/users");
  for (const p of ["payments", "invoices"]) await admin.locator("article", { hasText: "staff@test.local" }).locator(`input[name="perms"][value="${p}"]`).uncheck();
  await go(admin, admin.locator("article", { hasText: "staff@test.local" }).locator("button:has-text('Save permissions')"));
  await sp.goto(B + "/admin/invoices"); ok(/denied=1/.test(sp.url()), "revoked permission is removed immediately");
  ok(q1("SELECT COUNT(*) c FROM admin_activity WHERE action='set_permissions' AND entity_id='staff@test.local'").c === 2, "permission changes are logged");
  // A staff manager cannot hand out permissions they do not hold, nor create owners.
  await admin.goto(B + "/admin/users");
  await admin.locator("article", { hasText: "staff@test.local" }).locator('input[name="perms"][value="staff"]').check();
  await go(admin, admin.locator("article", { hasText: "staff@test.local" }).locator("button:has-text('Save permissions')"));
  await sp.goto(B + "/admin/users");
  const sf = sp.locator("form").filter({ has: sp.locator("button:has-text('Add user')") });
  await sf.locator('input[name="name"]').fill("Sneaky"); await sf.locator('input[name="email"]').fill("sneaky@test.local"); await sf.locator('input[name="password"]').fill("sneaky-password-123");
  await sf.locator('input[name="perms"][value="seo"]').check();
  await go(sp, sf.locator("button:has-text('Add user')"));
  ok(/cannot grant permissions you do not have: seo/.test(await flash(sp)) && !q1("SELECT 1 x FROM users WHERE email='sneaky@test.local'"), "staff manager cannot grant permissions they lack");
  ok((await sp.locator('select[name="role"] option[value="owner"]').count()) === 0, "staff manager is not offered the owner role");
  // Disabling an account ends its access.
  await admin.goto(B + "/admin/users");
  await go(admin, admin.locator("article", { hasText: "staff@test.local" }).locator("button:has-text('Disable account')"));
  await sp.goto(B + "/admin/orders"); ok(/\/admin\/login/.test(sp.url()), "disabled staff account is signed out");
  await sctx.close();
  ok(q1("SELECT COUNT(*) c FROM admin_activity WHERE action='add_user' AND entity_id='staff@test.local'").c === 1, "user creation logged");
  const any = q1("SELECT number FROM orders LIMIT 1").number;
  const fresh = (await browser.newContext()).request; // a visitor without the private order link
  const pub = await (await fresh.get(B + `/order/${any}`)).text();
  ok(pub.includes("Order not found") && !pub.includes("Coupon Street") && !pub.includes("Allen Avenue"), "order page without the private link shows no customer data");
  ok(!(await (await fresh.get(B + `/order/${any}?t=wrong-token-value`)).text()).includes("Ikeja"), "wrong order token reveals nothing");
  ok((await fresh.get(B + `/order/${any}/invoice`)).status() === 404, "invoice PDF needs the private order link");
});

await step("invoices", async () => {
  const o = q1("SELECT * FROM orders WHERE coupon_code='SAVE10' ORDER BY id LIMIT 1");
  ok(q1("SELECT number FROM invoices WHERE order_id=?", o.id)?.number?.startsWith("INV-"), "invoice created automatically when payment was verified");
  await admin.goto(B + `/admin/invoices/${o.id}`);
  const t = await admin.locator("article").innerText();
  ok(/PAID/.test(t) && /Products subtotal\s*₦20,000/.test(t) && /Discount \(SAVE10\)\s*−₦2,000/.test(t) && /Delivery\s*₦3,000/.test(t) && /Total\s*₦21,000/.test(t) && /Balance due\s*₦0/.test(t) && !/payable separately/.test(t), "invoice amounts match the order (₦20,000 − ₦2,000 + ₦3,000 delivery = ₦21,000 paid)");
  const unpaid = q1("SELECT * FROM orders WHERE payment_status='pending_payment' AND fulfilment_status!='cancelled' ORDER BY id DESC LIMIT 1");
  await admin.goto(B + `/admin/invoices/${unpaid.id}`);
  const u = await admin.locator("article").innerText();
  ok(/UNPAID/.test(u) && /Amount paid \(verified\)\s*₦0/.test(u) && !/\bPAID\b(?!.*UN)/.test(u.replace("UNPAID", "")), "unpaid order's invoice is not marked paid");
  const legacy = q1("SELECT id FROM orders WHERE number='WX200101-OLD01'").id;
  await admin.goto(B + `/admin/invoices/${legacy}`);
  const l = await admin.locator("article").innerText();
  ok(/Delivery\s*₦4,000/.test(l) && /Total\s*₦24,000/.test(l) && /PART PAID/.test(l) && /Balance due\s*₦4,000/.test(l), "pre-policy invoice uses its historical ₦4,000 delivery fee (part paid)");
  const pdf = await admin.request.get(B + `/api/admin/invoices/${o.id}`);
  const body = await pdf.body();
  ok(pdf.headers()["content-type"] === "application/pdf" && body.slice(0, 5).toString() === "%PDF-" && body.length > 1500, `PDF download works (${body.length} bytes)`);
  fs.writeFileSync(path.join(SHOTS, "invoice.pdf"), body);
  ok(body.includes(Buffer.from("NotoSans")), "PDF embeds the Noto Sans font (naira sign support)");
  const numbers = qa("SELECT number FROM invoices").map((r) => r.number);
  ok(new Set(numbers).size === numbers.length, `invoice numbers are unique (${numbers.length})`);
  await admin.goto(B + "/admin/invoices?q=" + encodeURIComponent(o.number));
  ok((await admin.locator("tbody tr").count()) === 1, "invoice search finds the order");
  await admin.goto(B + "/admin/invoices?status=paid");
  ok((await admin.locator("tbody").innerText()).includes(o.number), "invoice status filter");
  const cust = await (await browser.newContext()).request.get(B + `/order/${o.number}/invoice?t=${o.access_token}`);
  ok(cust.headers()["content-type"] === "application/pdf", "customer can download their invoice with the private link");
  await admin.goto(B + `/admin/invoices/${o.id}`); await admin.emulateMedia({ media: "print" });
  ok(!(await admin.locator('nav[aria-label="Admin"]').isVisible()) && await admin.locator("article").isVisible(), "print view hides the admin menu");
  await admin.screenshot({ path: path.join(SHOTS, "invoice-print.png"), fullPage: true }); await admin.emulateMedia({ media: "screen" });
});

await step("customers", async () => {
  await admin.goto(B + "/admin/customers?q=Coupon");
  ok((await admin.locator("tbody tr").count()) >= 1 && (await admin.locator("tbody").innerText()).includes("Coupon Tester"), "customer search by name");
  await admin.goto(B + "/admin/customers?q=0803 000 0001");
  ok((await admin.locator("tbody tr").count()) === 1, "customer search by phone");
  const phone = "2348030000001";
  const exp = q1(`SELECT COUNT(*) n, SUM(CASE WHEN payment_status='paid' THEN subtotal ELSE 0 END) paid, SUM(CASE WHEN payment_status!='paid' AND fulfilment_status!='cancelled' THEN subtotal ELSE 0 END) owed FROM orders WHERE phone=?`, phone);
  await admin.goto(B + `/admin/customers/${phone}`);
  const t = await admin.locator("main").innerText();
  const n = (x) => "₦" + Number(x).toLocaleString("en-NG");
  ok(new RegExp(`Orders\\s+${exp.n}`).test(t) && new RegExp(`Confirmed payments\\s+${n(exp.paid)}`).test(t) && new RegExp(`Outstanding\\s+${n(exp.owed)}`).test(t), `profile figures match verified payments (${n(exp.paid)} confirmed, ${n(exp.owed)} outstanding)`);
  ok(/Order history/.test(t) && /Activity/.test(t) && /Delivery addresses used/.test(t), "profile shows order history, activity and addresses");
  await admin.fill('textarea[name="note"]', "Prefers WhatsApp after 5pm."); await go(admin, admin.locator("button:has-text('Save notes')"));
  ok(q1("SELECT note FROM customer_notes WHERE customer_key=?", "phone:" + phone).note === "Prefers WhatsApp after 5pm.", "customer note saved");
  const csv = await (await admin.request.get(B + "/api/admin/customers-export")).text();
  ok(csv.includes("Confirmed payments (NGN)") && csv.includes(phone), "customer CSV export");
  await admin.goto(B + "/admin/customers/999"); ok((await admin.locator("text=not found").count()) + (await admin.locator("text=404").count()) > 0, "unknown customer returns not found");
});

await step("banners and homepage", async () => {
  await admin.goto(B + "/admin/banners/new");
  await admin.fill('input[name="heading"]', "Test promo banner");
  await admin.fill('textarea[name="description"]', "Banner created by the automated test.");
  await admin.fill('input[name="buttonText"]', "Shop combos"); await admin.fill('input[name="buttonUrl"]', "javascript:alert(1)");
  await admin.setInputFiles('input[name="desktopFile"]', path.join(FIX, "fixture-product.png"));
  await go(admin, admin.locator("button:has-text('Create banner')"));
  ok(/must start with/.test(await flash(admin)) && !q1("SELECT 1 x FROM banners"), "unsafe banner link rejected");
  ok(await admin.inputValue('input[name="heading"]') === "Test promo banner" && await admin.inputValue('textarea[name="description"]') === "Banner created by the automated test." && await admin.locator('input[name="buttonUrl"][aria-invalid="true"]').count() === 1, "banner form keeps typed values and marks the bad link");
  await admin.goto(B + "/admin/banners/new");
  await admin.fill('input[name="heading"]', "Test promo banner"); await admin.fill('textarea[name="description"]', "Banner created by the automated test.");
  await admin.fill('input[name="buttonText"]', "Shop combos"); await admin.fill('input[name="buttonUrl"]', "/category/combos");
  await admin.setInputFiles('input[name="desktopFile"]', path.join(FIX, "fixture-product.png"));
  await admin.selectOption('select[name="placement"]', "hero");
  await go(admin, admin.locator("button:has-text('Create banner')"));
  const bn = q1("SELECT * FROM banners ORDER BY id DESC LIMIT 1");
  ok(bn && bn.active === 0 && bn.desktop_image.startsWith("/product-images/") && bn.button_url === "/category/combos", "banner created switched off, image uploaded to persistent storage");
  ok(!(await (await anon.request.get(B + "/")).text()).includes("Test promo banner"), "switched-off banner not shown to customers");
  await admin.goto(B + `/?bannerPreview=${bn.id}`);
  ok(await admin.locator("text=Preview of banner").isVisible() && await admin.locator("h2", { hasText: "Test promo banner" }).isVisible(), "admin preview shows the banner before publishing");
  ok(!(await (await anon.request.get(B + `/?bannerPreview=${bn.id}`)).text()).includes("Test promo banner"), "preview link does nothing for customers");
  await admin.goto(B + "/admin/banners");
  await go(admin, admin.locator("tr", { hasText: "Test promo banner" }).locator("button:has-text('Switch on')"));
  const home = await (await anon.request.get(B + "/")).text();
  ok(home.includes("Test promo banner") && home.includes('href="/category/combos"') && home.includes("₦50,000"), "live banner shows on the homepage; free delivery threshold message shown");
  await go(admin, admin.locator("tr", { hasText: "Test promo banner" }).locator("button:has-text('Duplicate')"));
  ok(q1("SELECT COUNT(*) c FROM banners").c === 2 && q1("SELECT active FROM banners WHERE heading LIKE '%(copy)'").active === 0, "duplicate creates a switched-off copy");
  await admin.goto(B + `/admin/banners/${bn.id}`);
  await admin.fill('input[name="startsAt"]', "2099-01-01"); await go(admin, admin.locator("button:has-text('Save banner')"));
  ok(!(await (await anon.request.get(B + "/")).text()).includes("Test promo banner"), "banner scheduled in the future is hidden");
  await admin.goto(B + `/admin/banners/${bn.id}`);
  await admin.fill('input[name="startsAt"]', "2099-01-05"); await admin.fill('input[name="endsAt"]', "2099-01-01"); await go(admin, admin.locator("button:has-text('Save banner')"));
  ok(/end date/.test(await flash(admin)), "end date before start date rejected");
  await admin.goto(B + "/admin/media");
  ok((await admin.locator("article", { has: admin.locator(`img[src="${bn.desktop_image}"]`) }).locator("text=(banner)").count()) === 1, "media library marks the banner image as in use");
  await admin.goto(B + "/admin/banners");
  const row = admin.locator("tr", { hasText: "(copy)" }); await row.locator("summary:has-text('Delete')").click(); await row.locator('input[name="confirm"]').check();
  await go(admin, row.locator("button:has-text('Delete banner')"));
  ok(q1("SELECT COUNT(*) c FROM banners").c === 1, "banner deleted after confirmation");
  await admin.goto(B + "/admin/banners");
  await admin.fill('input[name="title"]', "Feel lighter with"); await admin.fill('input[name="accent"]', "WellnessXpress.");
  await go(admin, admin.locator("button:has-text('Save homepage text')"));
  ok((await (await anon.request.get(B + "/")).text()).includes("Feel lighter with"), "homepage hero text editable");
  await admin.fill('input[name="title"]', "Your weightloss journey"); await admin.fill('input[name="accent"]', "starts here."); await go(admin, admin.locator("button:has-text('Save homepage text')"));
});

await step("seo", async () => {
  await admin.goto(B + "/admin/seo");
  ok((await admin.locator("text=Checks").count()) === 1, "SEO dashboard loads with checks");
  const tb = q1("SELECT id FROM products WHERE slug='tummy-balance'").id;
  const pf = admin.locator(`form#p-${tb}`);
  await pf.locator('input[name="seoTitle"]').fill("Tummy Balance | Test SEO Title");
  await pf.locator('textarea[name="metaDescription"]').fill("Test meta description for Tummy Balance with free delivery across Nigeria.");
  await go(admin, pf.locator("button:has-text('Save')"));
  const html = await (await anon.request.get(B + "/product/tummy-balance")).text();
  ok(html.includes("<title>Tummy Balance | Test SEO Title") && html.includes('content="Test meta description for Tummy Balance') && html.includes('rel="canonical" href="' ) && html.includes("BreadcrumbList") && html.includes('"@type":"Product"'), "product title, description, canonical and structured data on the page");
  await admin.goto(B + "/admin/seo");
  await admin.locator(`form#p-${tb} input[name="noindex"]`).check(); await go(admin, admin.locator(`form#p-${tb} button:has-text('Save')`));
  ok(/noindex/.test(await (await anon.request.get(B + "/product/tummy-balance")).text()) && !(await (await anon.request.get(B + "/sitemap.xml")).text()).includes("/product/tummy-balance"), "hidden product gets noindex and leaves the sitemap");
  await admin.goto(B + "/admin/seo");
  await admin.locator(`form#p-${tb} input[name="noindex"]`).uncheck(); await go(admin, admin.locator(`form#p-${tb} button:has-text('Save')`));
  // redirects
  await admin.goto(B + "/admin/seo");
  const rf = admin.locator("#redirects form").first();
  await rf.locator('input[name="from"]').fill("/admin/x"); await rf.locator('input[name="to"]').fill("/shop"); await go(admin, rf.locator("button"));
  ok(/cannot be an admin/.test(await flash(admin)), "redirect from an admin path refused");
  await admin.goto(B + "/admin/seo");
  await admin.locator("#redirects form").first().locator('input[name="from"]').fill("/old-promo"); await admin.locator("#redirects form").first().locator('input[name="to"]').fill("/category/combos");
  await go(admin, admin.locator("#redirects form").first().locator("button"));
  const r = await anon.request.get(B + "/old-promo", { maxRedirects: 0 });
  ok([301, 308].includes(r.status()) && /\/category\/combos$/.test(r.headers()["location"] || ""), `saved redirect answers with a permanent redirect (${r.status()})`);
  await admin.goto(B + "/admin/seo");
  await admin.locator("#redirects form").first().locator('input[name="from"]').fill("/category/combos-x"); await admin.locator("#redirects form").first().locator('input[name="to"]').fill("/old-promo");
  await go(admin, admin.locator("#redirects form").first().locator("button"));
  await admin.goto(B + "/admin/seo");
  await admin.locator("#redirects form").first().locator('input[name="from"]').fill("/old-promo"); await admin.locator("#redirects form").first().locator('input[name="to"]').fill("/category/combos-x");
  await go(admin, admin.locator("#redirects form").first().locator("button"));
  ok(/loop/.test(await flash(admin)), "redirect loop refused");
  ok((await anon.request.get(B + "/no-such-page-xyz")).status() === 404, "unknown address still returns 404");
  // product address change keeps the old link working
  const pid = q1("SELECT id FROM products WHERE slug='e2e-test-product'").id;
  await admin.goto(B + `/admin/products/${pid}`); await admin.fill('input[name="slug"]', "e2e-test-product-renamed"); await go(admin, admin.locator("button:has-text('Save product')"));
  const old = await anon.request.get(B + "/product/e2e-test-product", { maxRedirects: 0 });
  ok([301, 308].includes(old.status()) && /e2e-test-product-renamed$/.test(old.headers()["location"] || ""), "old product address redirects to the new one");
  // global settings + noindex site
  await admin.goto(B + "/admin/seo");
  await admin.fill('input[name="homeTitle"]', "WellnessXpressBrand | Test Home Title"); await go(admin, admin.locator("button:has-text('Save site SEO')"));
  ok((await (await anon.request.get(B + "/")).text()).includes("<title>WellnessXpressBrand | Test Home Title</title>"), "homepage title from SEO settings");
  await admin.check('input[name="noindexSite"]'); await go(admin, admin.locator("button:has-text('Save site SEO')"));
  ok(/Disallow: \//.test(await (await anon.request.get(B + "/robots.txt")).text()), "whole-site noindex switches robots.txt to disallow");
  await admin.uncheck('input[name="noindexSite"]'); await go(admin, admin.locator("button:has-text('Save site SEO')"));
  const robots = await (await anon.request.get(B + "/robots.txt")).text();
  ok(/Allow: \//.test(robots) && /Sitemap:/.test(robots), "robots.txt restored with sitemap");
  ok(q1("SELECT COUNT(*) c FROM admin_activity WHERE action LIKE 'seo_%' OR action LIKE 'redirect_%'").c >= 5, "SEO changes logged");
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
await step("untracked stock history", async () => {
  const uv = q1("SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE v.stock IS NULL AND v.status='active' AND p.status='published' ORDER BY v.id LIMIT 1").id;
  const r = await (await postJ("/api/orders", { name: "Untracked Tester", phone: "08030000777", city: "Ikeja", address: "9 Stock Road, Ikeja", state: "Lagos", items: [{ variantId: uv, qty: 1 }] })).json();
  const oid = q1("SELECT id FROM orders WHERE number=?", r.number).id;
  await admin.goto(B + `/admin/orders/${oid}`);
  await admin.selectOption('select[name="status"]', "cancelled"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT fulfilment_status s FROM orders WHERE id=?", oid).s === "cancelled" && q1("SELECT COUNT(*) n FROM stock_movements WHERE order_id=?", oid).n === 0, "cancelling an order for an untracked product writes no stock history");
  await admin.selectOption('select[name="status"]', "unfulfilled"); await go(admin, admin.locator("button:has-text('Update status')").first());
  ok(q1("SELECT COUNT(*) n FROM stock_movements WHERE order_id=?", oid).n === 0 && q1("SELECT stock FROM variants WHERE id=?", uv).stock === null, "reopening it writes no stock history and keeps stock untracked");
});

await step("responsive", async () => {
  const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920];
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
    {
      // Regression: a cart with several items, long names and large amounts must not scroll sideways, and its controls stay on screen.
      const vs = qa("SELECT v.id, v.price, v.label, p.slug, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.status = 'active' AND p.status = 'published' ORDER BY v.price DESC LIMIT 3");
      const lines = vs.map((v, i) => ({ variantId: v.id, qty: 9 + i, slug: v.slug, name: i === 0 ? `${v.name} Extra Long Product Name For Layout Testing Purposes` : v.name, label: v.label, price: v.price, image: null }));
      await pg.evaluate((l) => localStorage.setItem("wx_cart_v2", JSON.stringify(l)), lines);
      for (const u of ["/cart", "/checkout"]) {
        await pg.goto(B + u, { waitUntil: "networkidle" });
        const [csw, ciw, rows, off] = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelectorAll("main li, main [data-line]").length,
          [...document.querySelectorAll("main button, main a, main input, main select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1); }).length]);
        ok((u !== "/cart" || rows >= 3) && csw <= ciw + 1 && off === 0, `${w}px: ${u} with 3 items and a long name has no sideways scroll (${csw}/${ciw}, ${off} controls off screen)`);
      }
      await pg.evaluate(() => localStorage.removeItem("wx_cart_v2"));
    }
    await ctx.close();
  }
});

// ---------------- server-side logout ----------------
await step("logout revokes the session", async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(B + "/admin/login");
  await p.fill("#email", process.env.ADMIN_EMAIL || "owner@test.local");
  await p.fill("#password", process.env.ADMIN_PASSWORD || "test-password-123"); await p.click("button:has-text('Sign in')");
  await p.waitForURL(B + "/admin");
  const cookie = (await ctx.cookies()).find((c) => c.name === "wx_admin");
  ok(!!cookie && cookie.httpOnly, "sign-in sets an httpOnly session cookie");
  ok((await ctx.request.get(B + "/api/admin/export")).status() === 200, "session works before sign-out");
  await go(p, p.locator("button:has-text('Sign out')"));
  ok(/\/admin\/login/.test(p.url()), "sign-out returns to the login page");
  // Replay the copied cookie in a fresh browser: it must no longer work.
  const thief = await browser.newContext(); await thief.addCookies([{ ...cookie }]);
  const tp = await thief.newPage(); await tp.goto(B + "/admin/orders");
  ok(/\/admin\/login/.test(tp.url()), "copied cookie after sign-out cannot open admin pages");
  ok((await thief.request.get(B + "/api/admin/export")).status() === 404, "copied cookie after sign-out cannot export data");
  ok(q1("SELECT COUNT(*) c FROM revoked_sessions").c >= 1, "signed-out session id is recorded server-side");
  await thief.close(); await ctx.close();
});

await step("cart page metadata and tracking ids", async () => {
  const html = await (await anon.request.get(B + "/cart")).text();
  ok(/<title>Your cart[^<]*<\/title>/.test(html) && /<meta name="robots" content="noindex/.test(html), "cart page has its own title and noindex");
  const src = (f) => fs.readFileSync(path.join(FIX, "..", f), "utf8");
  ok(/content_ids: \[contentId\(l\)\]/.test(src("src/components/CartProvider.tsx")) && /content_ids: lines\.map\(contentId\)/.test(src("src/components/CheckoutForm.tsx")), "AddToCart and InitiateCheckout use the SKU as content_ids, like ViewContent and Purchase");
});

await browser.close();
fs.writeFileSync(path.join(SHOTS, "results.txt"), results.map((r) => r.join("  ")).join("\n") + `\n\n${pass} passed, ${fail} failed\n`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
