/*
 * API integration tests for orders, payment evidence and tracking safety.
 * Runs against a local server that uses a DISPOSABLE data directory. Never point it at production.
 *
 *   DATA_DIR=/tmp/wx-api-test ADMIN_EMAIL=owner@test.local ADMIN_PASSWORD=<redacted> \
 *     COMING_SOON=false npx next start -p 3301
 *   WX_BASE=http://localhost:3301 WX_DATA=/tmp/wx-api-test node tests/api-integration.mjs
 *
 * No Meta/TikTok credentials are set in the test environment, so no real Purchase can be sent.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const B = process.env.WX_BASE || "http://localhost:3301";
const DATA = process.env.WX_DATA;
if (!DATA || /^\/data\/?$/.test(DATA)) { console.error("Set WX_DATA to the disposable test data directory."); process.exit(2); }
const q1 = (s, ...p) => { const d = new DatabaseSync(path.join(DATA, "store.db")); try { return d.prepare(s).get(...p); } finally { d.close(); } };
const ORIGIN = { origin: B };

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log(cond ? "✓" : "✗", name); cond ? pass++ : fail++; };
const step = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} threw: ${String(e.message).split("\n")[0]}`); } };
const postJ = (u, body, headers = {}) => fetch(B + u, { method: "POST", headers: { "Content-Type": "application/json", ...ORIGIN, ...headers }, body: JSON.stringify(body) });

const funnelBody = (over = {}) => ({
  name: "Api Test Customer", phone: "08031234567", state: "Lagos",
  address: "12 Integration Close, Ikeja, Lagos", clientKey: "apitest-" + Math.random().toString(36).slice(2, 14) + "xx",
  ...over,
});

// ---------------- health & cross-site protection ----------------
await step("health", async () => {
  const r = await fetch(B + "/api/health");
  ok(r.status === 200, "health endpoint returns 200");
});
await step("cross-site protection", async () => {
  const r = await postJ("/api/funnel/order", funnelBody(), { origin: "https://evil.example" });
  ok(r.status === 403, "cross-site funnel order POST rejected (403)");
  const r2 = await postJ("/api/orders", { name: "x" }, { origin: "https://evil.example" });
  ok(r2.status === 403, "cross-site store order POST rejected (403)");
});

// ---------------- funnel orders ----------------
let orderNumber = "", orderToken = "";
await step("funnel order creation", async () => {
  const key = "apitest-fixed-key-0001";
  const r = await postJ("/api/funnel/order", funnelBody({ clientKey: key, price: 1, total: 1 }));
  const j = await r.json();
  ok(r.status === 200 && j.ok && j.number, "funnel order created");
  orderNumber = j.number; orderToken = j.token;
  const row = q1("SELECT payment_status s, total t FROM orders WHERE number = ?", orderNumber);
  ok(row.s === "pending_payment", "new funnel order is pending_payment, NOT paid");
  ok(row.t === 30000, `client-supplied price ignored; server total is 30000 (got ${row.t})`);
  const r2 = await postJ("/api/funnel/order", funnelBody({ clientKey: key }));
  const j2 = await r2.json();
  ok(j2.duplicate === true && j2.number === orderNumber, "same clientKey returns the same order (duplicate)");
  ok(q1("SELECT COUNT(*) c FROM orders WHERE client_key = ?", key).c === 1, "duplicate submission created exactly one order row");
});
await step("funnel order validation", async () => {
  const badPhone = await (await postJ("/api/funnel/order", funnelBody({ phone: "123" }))).json().catch(() => ({}));
  ok(!!badPhone.errors?.phone, "invalid phone rejected with a field error");
  const badState = await postJ("/api/funnel/order", funnelBody({ state: "NotAState" }));
  ok(badState.status === 400, "invalid state rejected (400)");
  const noName = await postJ("/api/funnel/order", funnelBody({ name: "x" }));
  ok(noName.status === 400, "too-short name rejected (400)");
});

// ---------------- store order validation ----------------
await step("store order validation", async () => {
  const r = await postJ("/api/orders", { name: "x", items: [] });
  ok(r.status === 400, "invalid store order rejected (400)");
  const r2 = await postJ("/api/orders", { name: "Valid Name", phone: "08031234567", state: "Lagos", city: "Ikeja", address: "12 Integration Close", items: [{ variantId: 99999999, qty: 1 }] });
  ok(r2.status === 400, "order for a non-existent variant rejected (400) — prices/ids are server-resolved");
});

// ---------------- customer payment submission (orders) ----------------
await step("order payment submission never marks paid", async () => {
  const noToken = await fetch(B + `/api/orders/${orderNumber}/payment`, { method: "POST", headers: ORIGIN, body: new FormData() });
  ok(noToken.status === 404, "payment submission without the order token is 404");
  const fd = new FormData();
  fd.set("t", orderToken);
  fd.set("payerName", "Api Test Customer");
  const r = await fetch(B + `/api/orders/${orderNumber}/payment`, { method: "POST", headers: ORIGIN, body: fd });
  ok(r.status === 200, "payment submission with token accepted");
  const s = q1("SELECT payment_status s FROM orders WHERE number = ?", orderNumber).s;
  ok(s === "awaiting_verification", `payment submission → awaiting_verification, NOT paid (got ${s})`);
  ok(q1("SELECT purchase_event_status s FROM orders WHERE number = ?", orderNumber).s === "", "no Purchase event recorded before admin verification");
});

// ---------------- confirm-payment submissions ----------------
const png = fs.readFileSync(path.join(process.cwd(), "tests/fixture-product.png"));
const cpForm = (over = {}) => {
  const fd = new FormData();
  fd.set("orderReference", over.orderReference ?? orderNumber);
  fd.set("fullName", over.fullName || "Api Test Customer");
  fd.set("phone", over.phone || "08031234567");
  fd.set("amount", over.amount || "30000");
  fd.set("address", over.address || "12 Integration Close, Ikeja");
  fd.set("state", over.state || "Lagos");
  if (over.file !== null) fd.set("receipt", over.file || new Blob([png], { type: "image/png" }), over.fileName || "receipt.png");
  return fd;
};
await step("confirm-payment submission", async () => {
  const r = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm() });
  ok(r.status === 200, "valid confirm-payment submission with matching order reference accepted");
  const row = q1("SELECT status s, receipt_hash h, order_number n FROM payment_confirmations WHERE phone = '08031234567' ORDER BY id DESC LIMIT 1");
  ok(row.s === "awaiting_verification", "submission stored as awaiting_verification, NOT paid");
  ok(!!row.h && row.h.length === 64, "receipt hash stored for duplicate detection");
  ok(row.n === orderNumber, "submission linked to the matched order number");
  const dup = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm() });
  ok(dup.status === 409, "duplicate submission for the same order rejected (409)");
  ok(q1("SELECT COUNT(*) c FROM payment_confirmations WHERE phone = '08031234567'").c === 1, "duplicate created no second submission");
});
await step("confirm-payment validation", async () => {
  const missing = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm({ file: null }) });
  ok(missing.status === 400, "missing receipt rejected (400)");
  const notImage = new Blob([Buffer.from("this is not an image at all")], { type: "image/png" });
  const bad = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm({ phone: "08031112233", file: notImage, fileName: "fake.png" }) });
  ok(bad.status === 400, "fake image (bad magic bytes) rejected (400)");
  const big = new Blob([Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)])], { type: "image/png" });
  const huge = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm({ phone: "08034445566", file: big, fileName: "big.png" }) });
  ok(huge.status === 400, "oversized receipt (>5MB) rejected (400)");
  const badAmount = await fetch(B + "/api/confirm-payment", { method: "POST", headers: ORIGIN, body: cpForm({ phone: "08037778899", amount: "50" }) });
  ok(badAmount.status === 400, "implausible amount rejected (400)");
});

// ---------------- admin surface stays private ----------------
await step("admin endpoints hidden when signed out", async () => {
  for (const u of ["/api/admin/export", "/api/admin/receipt/1", "/api/admin/confirmation-receipt/1", "/api/admin/customers-export"]) {
    const r = await fetch(B + u);
    ok(r.status === 404, `signed-out ${u} → 404`);
  }
});

// ---------------- meta-capi relay cannot be abused ----------------
await step("meta-capi relay restrictions", async () => {
  const purchase = await fetch(B + "/api/meta-capi", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://wellnessxpressbrand.com" }, body: JSON.stringify({ event_name: "Purchase", event_id: "pu_1234567890_abcd", event_source_url: "https://wellnessxpressbrand.com/whatsapp-weightloss/" }) });
  ok(purchase.status === 400, "relay refuses Purchase events from the browser (400)");
  const badOrigin = await fetch(B + "/api/meta-capi", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ event_name: "PageView", event_id: "pv_1234567890_abcd", event_source_url: "https://wellnessxpressbrand.com/" }) });
  ok(badOrigin.status === 403, "relay rejects non-allowlisted origins (403)");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
