import "server-only";
import { createHash } from "crypto";

/*
 * Server-side events for funnel orders. Meta uses the WhatsApp funnel dataset (Edith Pixel 1) and its token.
 * TikTok uses its own Pixel code and Events API token (TIKTOK_PIXEL_CODE, TIKTOK_EVENTS_ACCESS_TOKEN). Nothing is sent when a token is missing.
 * Purchase is called only from the admin "confirm payment" action. Lead is called when the order is created.
 */
const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
type Ev = { name: "Purchase" | "Lead"; eventId: string; number: string; phone: string; value: number; url: string; tracking: string; items?: { id: string; name: string; price: number; qty: number }[] };
type Tr = { fbp?: string; fbc?: string; ttp?: string; ttclid?: string; ua?: string; ip?: string };
const parse = (raw: string): Tr => { try { return JSON.parse(raw) as Tr; } catch { return {}; } };

export async function sendMetaFunnel(e: Ev) {
  const pixel = process.env.META_PIXEL_ID_WHATSAPP || "1290890196474517";
  const token = process.env.META_CAPI_ACCESS_TOKEN_WHATSAPP;
  if (!token) return "not_configured";
  const t = parse(e.tracking);
  const user: Record<string, unknown> = { country: [sha("ng")], external_id: [sha("order:" + e.number)] };
  if (e.phone) user.ph = [sha(e.phone)];
  if (t.fbp) user.fbp = t.fbp;
  if (t.fbc) user.fbc = t.fbc;
  if (t.ua) user.client_user_agent = t.ua;
  if (t.ip) user.client_ip_address = t.ip;
  // The purchase test code applies to Purchase only — a Lead must never be diverted to Test Events by it.
  const test = e.name === "Purchase" ? process.env.META_PURCHASE_TEST_EVENT_CODE : undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${pixel}/events`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        data: [{ event_name: e.name, event_time: Math.floor(Date.now() / 1000), event_id: e.eventId, action_source: "website", event_source_url: e.url, user_data: user,
          custom_data: { currency: "NGN", value: e.value, content_name: "General Fat Loss 3-in-1 Combo", content_type: "product", order_id: e.number } }],
        ...(test ? { test_event_code: test } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? (test ? "sent_test" : "sent") : "meta_error_" + r.status;
  } catch { return "network_error"; }
}

/** TikTok Events API. Unverified until you provide credentials and see the event in TikTok Events Manager. */
export async function sendTikTokPurchase(e: Ev) {
  const code = process.env.TIKTOK_PIXEL_CODE, token = process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
  if (!code || !token) return "not_configured";
  const t = parse(e.tracking);
  const user: Record<string, unknown> = {};
  if (e.phone) user.phone_number = sha("+" + e.phone.replace(/\D/g, ""));
  user.external_id = sha("order:" + e.number);
  if (t.ttclid) user.ttclid = t.ttclid;
  if (t.ttp) user.ttp = t.ttp;
  if (t.ip) user.ip = t.ip;
  if (t.ua) user.user_agent = t.ua;
  const test = process.env.TIKTOK_TEST_EVENT_CODE;
  try {
    const r = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST", headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify({
        event_source: "web", event_source_id: code, ...(test ? { test_event_code: test } : {}),
        data: [{ event: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: e.eventId, user, page: { url: e.url },
          // Contents describe what was actually bought when the caller knows the items (store orders);
          // the combo default remains for funnel orders, which sell only the 3-in-1 combo.
          properties: { currency: "NGN", value: e.value, content_type: "product", order_id: e.number, contents: e.items?.length ? e.items.map((i) => ({ content_id: i.id, content_name: i.name, quantity: i.qty, price: i.price })) : [{ content_id: "WX-3IN1-COMBO", content_name: "General Fat Loss 3-in-1 Combo", quantity: 1, price: e.value }] } }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json().catch(() => ({}))) as { code?: number };
    return r.ok && j.code === 0 ? (test ? "sent_test" : "sent") : "tiktok_error_" + (j.code ?? r.status);
  } catch { return "network_error"; }
}

/** Called from the admin "confirm payment" action for funnel orders. Returns the Meta status and the TikTok status. */
export async function sendFunnelPurchase(o: { number: string; total: number; phone: string; tracking: string; url: string; skipMeta?: boolean; skipTikTok?: boolean; items?: { id: string; name: string; price: number; qty: number }[] }) {
  const e: Ev = { name: "Purchase", eventId: "pu_" + o.number, number: o.number, phone: o.phone, value: o.total, url: o.url, tracking: o.tracking, items: o.items };
  // Skipped platforms report "already_sent", never "sent": nothing was sent in this call, and callers must not
  // record a fresh production send that did not happen.
  const [meta, tiktok] = await Promise.all([o.skipMeta ? Promise.resolve("already_sent") : sendMetaFunnel(e), o.skipTikTok ? Promise.resolve("already_sent") : sendTikTokPurchase(e)]);
  return { eventId: e.eventId, meta, tiktok };
}
