import "server-only";

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
  // The store sends to the same Meta dataset as the rest of the site (Edith Pixel 1), so when no
  // store-specific token is configured, fall back to the site's main Conversions API token.
  const token = process.env.META_STORE_CAPI_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixel || !token || o.total == null) return { status: "not_configured", eventId: "" };
  // Either test-code variable routes this event to Meta Test Events only; it then reports "sent_test",
  // never "sent", so a test send can neither suppress nor masquerade as the production Purchase.
  const test = process.env.META_PURCHASE_TEST_EVENT_CODE || process.env.META_CAPI_TEST_EVENT_CODE;
  // Stable per-order event id: a retry of the same order's Purchase is deduplicated by Meta instead of double-counting.
  const eventId = "pu_" + o.number;
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
        ...(test ? { test_event_code: test } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.ok ? (test ? "sent_test" : "sent") : "meta_error_" + r.status, eventId };
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
