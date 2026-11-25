import "server-only";
import { createHash } from "crypto";

function userData(raw: string) {
  try {
    const t = JSON.parse(raw) as { fbp?: string; fbc?: string; ua?: string; ip?: string };
    const u: Record<string, string> = {};
    if (t.fbp) u.fbp = t.fbp;
    if (t.fbc) u.fbc = t.fbc;
    if (t.ua) u.client_user_agent = t.ua;
    if (t.ip) u.client_ip_address = t.ip;
    return u;
  } catch {
    return {};
  }
}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
/** Nigerian numbers to digits with country code, for Meta matching (234XXXXXXXXXX). */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("234") && d.length >= 12) return d;
  if (d.startsWith("0") && d.length === 11) return "234" + d.slice(1);
  if (d.length === 10) return "234" + d;
  return d;
}

/**
 * Purchase for a payment confirmation form submission. Called only from the admin "Mark as PAID" action.
 * Uses the WhatsApp funnel Pixel (Edith Pixel 1) and its server token. Sends the verified amount in NGN, the hashed
 * phone number and any Meta cookies the customer's browser had. The event id is fixed per submission, so a repeat
 * send is deduplicated by Meta. If META_PURCHASE_TEST_EVENT_CODE is set, events go to Meta Test Events only.
 */
export async function sendConfirmationPurchase(c: { id: number; phone: string; amount: number; tracking: string; url: string }) {
  const pixel = process.env.META_PIXEL_ID_WHATSAPP || "1290890196474517";
  const token = process.env.META_CAPI_ACCESS_TOKEN_WHATSAPP;
  const eventId = "pc_" + c.id;
  if (!token) return { status: "not_configured", eventId };
  const ph = normalizePhone(c.phone);
  const user: Record<string, unknown> = { country: [sha("ng")], external_id: [sha("pc" + c.id)] };
  if (ph.length >= 10) user.ph = [sha(ph)];
  Object.assign(user, userData(c.tracking));
  const test = process.env.META_PURCHASE_TEST_EVENT_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        data: [{
          event_name: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: "website",
          event_source_url: c.url, user_data: user,
          custom_data: { currency: "NGN", value: c.amount, content_name: "General Fat Loss 3-in-1 Combo", content_type: "product", order_id: "PC" + c.id },
        }],
        ...(test ? { test_event_code: test } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.ok ? (test ? "sent_test" : "sent") : "meta_error_" + r.status, eventId };
  } catch {
    return { status: "network_error", eventId };
  }
}
