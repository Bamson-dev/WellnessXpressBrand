/*
 * Regression tests for the payment / tracking rules that must never break again:
 *  - Purchase fires only after an admin confirms payment, never on order creation or receipt upload.
 *  - A test event ("sent_test") is never treated as a production Purchase ("sent").
 *  - Mark-as-Paid is an atomic claim (conditional UPDATE), so concurrent confirmations cannot double-send.
 *  - Purchase event ids are stable per order, so retries are deduplicated by Meta / TikTok.
 * Run with: node tests/tracking-regression.mjs   (no server needed)
 */
import fs from "node:fs";
import assert from "node:assert/strict";

const read = (f) => fs.readFileSync(f, "utf8");
const admin = read("src/app/admin/actions.ts");
const confActions = read("src/app/admin/confirmation-actions.ts");
const meta = read("src/lib/meta.ts");
const capiFunnel = read("src/lib/capi-funnel.ts");
const metaConf = read("src/lib/meta-confirmation.ts");
const ordersRoute = read("src/app/api/orders/route.ts");
const funnelRoute = read("src/app/api/funnel/order/route.ts");
const orderPaymentRoute = read("src/app/api/orders/[number]/payment/route.ts");
const confirmRoute = read("src/app/api/confirm-payment/route.ts");
const pixel = read("src/components/pixel.tsx");
const tiktok = read("src/components/tiktok.tsx");
const envExample = read(".env.example");

// --- test vs production separation ---
assert.ok(!/startsWith\("sent"\)/.test(admin), "admin actions must not treat sent_test as sent (startsWith)");
assert.ok(!/\.startsWith\("sent"\)/.test(confActions), "confirmation actions must not treat sent_test as sent");
assert.match(confActions, /ev\.status === "sent"/, "confirmation message keys on exact production status");
assert.match(confActions, /ev\.status === "sent_test"/, "confirmation message distinguishes test events");
assert.match(metaConf, /test \? "sent_test" : "sent"/, "confirmation Purchase keeps test/prod statuses distinct");
assert.match(capiFunnel, /test \? "sent_test" : "sent"/, "funnel Meta Purchase keeps test/prod statuses distinct");

// --- atomic, idempotent mark-as-paid ---
assert.match(admin, /WHERE id = \? AND payment_status != 'paid'/, "order verify uses a conditional UPDATE claim");
assert.match(admin, /Number\(claimed\.changes\) !== 1/, "order verify aborts when the claim was already taken");
assert.match(confActions, /WHERE id = \? AND status != 'paid'/, "confirmation mark-paid uses a conditional UPDATE claim");
assert.match(confActions, /Number\(claimed\.changes\) !== 1/, "confirmation mark-paid aborts when already claimed");

// --- stable event ids (platform deduplication) ---
assert.match(meta, /eventId = "pu_" \+ o\.number/, "store Purchase event id is stable per order");
assert.ok(!/eventId = "pu_" \+ Date\.now/.test(meta), "store Purchase event id must not be random per call");
assert.match(capiFunnel, /eventId: "pu_" \+ o\.number/, "funnel Purchase event id is stable per order");
assert.match(metaConf, /eventId = "pc_" \+ c\.id/, "confirmation Purchase event id is stable per submission");
assert.match(capiFunnel, /Promise\.resolve\("already_sent"\)/, "skipped platforms never report a fresh 'sent'");

// --- Purchase only after admin confirmation ---
assert.ok(!/Purchase/.test(ordersRoute), "store order creation route never sends a Purchase");
assert.ok(!/name: "Purchase"/.test(funnelRoute) && !/sendFunnelPurchase/.test(funnelRoute), "funnel order route sends no Purchase");
assert.match(funnelRoute, /name: "Lead"/, "funnel order creation sends Lead only");
assert.ok(!/payment_status = 'paid'/.test(orderPaymentRoute), "customer payment route can never mark an order paid");
assert.match(orderPaymentRoute, /awaiting_verification/, "customer payment route only moves orders to awaiting_verification");
assert.ok(!/status = 'paid'/.test(confirmRoute), "confirm-payment route can never mark a submission paid");

// --- receipt duplicate protection ---
assert.match(confirmRoute, /receipt_hash/, "confirm-payment stores a receipt hash");
assert.match(confirmRoute, /status: 409/, "duplicate receipt submission is rejected");

// --- pixels: single init, no browser Purchase ---
assert.strictEqual((pixel.match(/fbq\('init'/g) || []).length, 1, "exactly one Meta Pixel init in the store pixel component");
assert.ok(!/track\("Purchase"/.test(pixel) && !/track\("Purchase"/.test(tiktok), "browser pixels never fire Purchase");
assert.match(tiktok, /NEXT_PUBLIC_TIKTOK_PIXEL_CODE/, "TikTok browser pixel is env-gated");

// --- env documentation ---
for (const v of ["META_STORE_CAPI_TOKEN", "META_CAPI_ACCESS_TOKEN_WHATSAPP", "META_PIXEL_ID_WHATSAPP", "META_PURCHASE_TEST_EVENT_CODE", "TIKTOK_PIXEL_CODE", "TIKTOK_EVENTS_ACCESS_TOKEN", "TIKTOK_TEST_EVENT_CODE", "ADMIN_SESSION_SECRET", "NEXT_PUBLIC_TIKTOK_PIXEL_CODE"]) {
  assert.ok(envExample.includes(v + "="), `.env.example documents ${v}`);
}

// TikTok Purchase completion: store orders and payment confirmations.
assert.ok(admin.includes("purchase_events_tiktok") && admin.includes('eventId: "pu_" + o.number'), "store orders send a TikTok Purchase at Mark-as-Paid with the stable pu_ event id");
assert.ok(confActions.includes("sendTikTokPurchase") && confActions.includes('number: "PC" + id'), "payment confirmations send a TikTok Purchase at Mark-as-Paid");
assert.ok(confActions.includes("tiktok_event_status"), "confirmation TikTok status is stored separately from Meta");

// Payment confirmations are bound to a real order.
assert.ok(confirmRoute.includes("getOrderByNumber") && confirmRoute.includes("errors.orderReference"), "confirm-payment requires and validates an order reference server-side");
assert.ok(confirmRoute.includes("matchedOrder.total ?? matchedOrder.subtotal"), "confirm-payment validates the amount against the order total, never the client's word");
assert.ok(confirmRoute.includes("normalisePhone(phone) !== normalisePhone"), "confirm-payment validates the phone against the order");
assert.ok(confirmRoute.includes("status IN ('awaiting_verification', 'paid')"), "one active submission per order");
assert.ok(confirmRoute.includes("WHERE receipt_hash = ? LIMIT 1"), "the same receipt file cannot be reused across orders");

console.log("Tracking/payment regression checks passed.");
