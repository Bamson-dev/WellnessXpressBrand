// Order-reference integration tests for /api/confirm-payment. Run against a SECOND disposable server
// instance (its own WX_DATA dir and port) because the endpoint is rate-limited per IP and this suite
// needs more submissions than one bucket allows; distinct cf-connecting-ip values stand in for
// distinct customers. No real payment events can fire: submissions never mark anything paid.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const B = process.env.WX_BASE || "http://localhost:3302";
const DATA = process.env.WX_DATA;
if (!DATA || /^\/data\/?$/.test(DATA)) { console.error("Set WX_DATA to the disposable test data directory."); process.exit(2); }
const db = () => new DatabaseSync(path.join(DATA, "store.db"));
const q1 = (s, ...p) => { const d = db(); try { return d.prepare(s).get(...p); } finally { d.close(); } };
const run = (s, ...p) => { const d = db(); try { return d.prepare(s).run(...p); } finally { d.close(); } };
const ORIGIN = { origin: B };

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log(cond ? "✓" : "✗", name); cond ? pass++ : fail++; };
const step = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} threw: ${String(e.message).split("\n")[0]}`); } };

const funnelBody = (phone, key) => ({ name: "Ref Test Customer", phone, state: "Lagos", address: "12 Integration Close, Ikeja, Lagos", clientKey: key });
async function makeOrder(phone, key) {
  const r = await fetch(B + "/api/funnel/order", { method: "POST", headers: { "Content-Type": "application/json", ...ORIGIN }, body: JSON.stringify(funnelBody(phone, key)) });
  const j = await r.json();
  if (!j.number) throw new Error("order creation failed: " + JSON.stringify(j));
  return j.number;
}

const png = fs.readFileSync(path.join(process.cwd(), "tests/fixture-product.png"));
const pngVariant = (tag) => new Blob([Buffer.concat([png, Buffer.from(tag)])], { type: "image/png" });
const submit = (ip, over = {}) => {
  const fd = new FormData();
  if (over.orderReference !== null) fd.set("orderReference", over.orderReference ?? "");
  fd.set("fullName", over.fullName || "Ref Test Customer");
  fd.set("phone", over.phone || "");
  fd.set("amount", over.amount || "30000");
  fd.set("address", over.address || "12 Integration Close, Ikeja");
  fd.set("state", over.state || "Lagos");
  fd.set("receipt", over.file || new Blob([png], { type: "image/png" }), "receipt.png");
  return fetch(B + "/api/confirm-payment", { method: "POST", headers: { ...ORIGIN, "cf-connecting-ip": ip }, body: fd });
};

const P1 = "08031001001", P2 = "08031001002", P3 = "08031001003", P4 = "08031001004";
let O1, O2, O3, O4;
await step("setup orders", async () => {
  O1 = await makeOrder(P1, "reftest-o1");
  O2 = await makeOrder(P2, "reftest-o2");
  O3 = await makeOrder(P3, "reftest-o3");
  O4 = await makeOrder(P4, "reftest-o4");
  run("UPDATE orders SET payment_status = 'paid' WHERE number = ?", O3);
  run("UPDATE orders SET fulfilment_status = 'cancelled' WHERE number = ?", O4);
  ok(!!O1 && !!O2 && !!O3 && !!O4, "four test orders created");
});

await step("reference validation (bucket A)", async () => {
  const ip = "10.0.0.1";
  let r = await submit(ip, { orderReference: null, phone: P1 });
  ok(r.status === 400, "missing order reference rejected (400)");
  r = await submit(ip, { orderReference: "ORDER-123", phone: P1 });
  ok(r.status === 400, "malformed order reference rejected (400)");
  r = await submit(ip, { orderReference: "WX990101-ZZZZZ", phone: P1 });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 400 && !!j.errors?.orderReference, "non-existent order reference rejected with a field error (400)");
  r = await submit(ip, { orderReference: O1, phone: P1, amount: "29000" });
  const j2 = await r.json().catch(() => ({}));
  ok(r.status === 400 && !!j2.errors?.amount, "amount that does not match the order total rejected (400)");
});

await step("phone matching and the valid submission (bucket B)", async () => {
  const ip = "10.0.0.2";
  let r = await submit(ip, { orderReference: O1, phone: "08039999999" });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 400 && !!j.errors?.phone, "phone that does not match the order rejected (400)");
  r = await submit(ip, { orderReference: O1, phone: P1 });
  ok(r.status === 200, "valid submission (matching reference, phone, amount) accepted");
  const row = q1("SELECT status s, order_number n FROM payment_confirmations WHERE order_number = ?", O1);
  ok(row && row.s === "awaiting_verification", "submission stored as awaiting_verification, NOT paid");
  ok(q1("SELECT payment_status s FROM orders WHERE number = ?", O1).s === "pending_payment", "the order itself is still NOT paid after evidence submission");
  r = await submit(ip, { orderReference: O1, phone: P1, file: pngVariant("different-receipt") });
  ok(r.status === 409, "second submission for the same order rejected (409), even with a different receipt");
});

await step("receipt reuse and closed orders (bucket C)", async () => {
  const ip = "10.0.0.3";
  let r = await submit(ip, { orderReference: O2, phone: P2 });
  ok(r.status === 409, "the same receipt file reused for a different order rejected (409)");
  r = await submit(ip, { orderReference: O3, phone: P3, file: pngVariant("paid-order") });
  ok(r.status === 400, "submission for an already-paid order rejected (400)");
  r = await submit(ip, { orderReference: O4, phone: P4, file: pngVariant("cancelled-order") });
  ok(r.status === 400, "submission for a cancelled order rejected (400)");
  ok(q1("SELECT COUNT(*) c FROM payment_confirmations").c === 1, "exactly one submission exists after all attempts");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
