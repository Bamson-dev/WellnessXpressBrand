import "server-only";
import { randomBytes } from "crypto";

/*
 * Meta tracking for the main store only. It uses its own env vars and never touches the funnel pixels
 * (WhatsApp / Telegram) handled by /api/meta-capi.
 *   NEXT_PUBLIC_META_PIXEL_ID   browser Pixel for the store (optional)
 *   META_STORE_CAPI_TOKEN       server token for the same Pixel (optional)
 * Purchase is sent only from the admin "verify payment" action, never when an order is placed.
 * Only order value, currency and SKUs are sent. No health or personal details.
 */
export async function sendStorePurchase(o: { number: string; total: number | null; skus: string[]; url: string; tracking: string }) {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_STORE_CAPI_TOKEN;
  if (!pixel || !token || o.total == null) return { status: "not_configured", eventId: "" };
  const eventId = "pu_" + Date.now() + "_" + randomBytes(4).toString("hex");
  try {
    const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        data: [{
          event_name: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: "website",
          event_source_url: o.url, user_data: userData(o.tracking),
          custom_data: { currency: "NGN", value: o.total, content_ids: o.skus, content_type: "product", order_id: o.number },
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.ok ? "sent" : "meta_error_" + r.status, eventId };
  } catch {
    return { status: "network_error", eventId };
  }
}

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
