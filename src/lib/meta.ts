import "server-only";
import { createHash } from "crypto";

/*
 * Meta tracking for the main store only.
 *   NEXT_PUBLIC_META_PIXEL_ID   browser Pixel for the store (Edith Pixel 1, 1290890196474517)
 *   META_STORE_CAPI_TOKEN       server token for that Pixel (optional override)
 * Token pairing matters: META_CAPI_ACCESS_TOKEN belongs to the Telegram Pixel (see /api/meta-capi)
 * and Meta rejects it for this dataset (HTTP 400), so it must never be used here. The token proven
 * for this Pixel is META_CAPI_ACCESS_TOKEN_WHATSAPP — the funnel/confirmation paths deliver to the
 * same dataset (1290890196474517) with it — so it is the fallback when no store token is set.
 * Purchase is sent only from the admin "verify payment" action, never when an order is placed.
 */
const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export async function sendStorePurchase(o: { number: string; total: number | null; skus: string[]; url: string; tracking: string; phone: string }) {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_STORE_CAPI_TOKEN || process.env.META_CAPI_ACCESS_TOKEN_WHATSAPP;
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
          event_source_url: o.url, user_data: userData(o),
          custom_data: { currency: "NGN", value: o.total, content_ids: o.skus, content_type: "product", order_id: o.number },
        }],
        ...(test ? { test_event_code: test } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { status: test ? "sent_test" : "sent", eventId };
    // Record Meta's own error code/subcode (never the token) so a failure is diagnosable from the
    // order page instead of a bare HTTP status.
    const j = (await r.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number } };
    return { status: "meta_error_" + r.status + (j.error?.code ? "_" + j.error.code : "") + (j.error?.error_subcode ? "_" + j.error.error_subcode : ""), eventId };
  } catch {
    return { status: "network_error", eventId };
  }
}

function userData(o: { tracking: string; phone: string; number: string }) {
  // Always include the strong identifiers (hashed), like the funnel/confirmation paths do: an event
  // whose user_data is empty or cookie-only is both weaker for matching and liable to be rejected.
  const u: Record<string, unknown> = { country: [sha("ng")], external_id: [sha("order:" + o.number)] };
  const ph = o.phone.replace(/\D/g, "");
  if (ph.length >= 10) u.ph = [sha(ph)];
  try {
    const t = JSON.parse(o.tracking) as { fbp?: string; fbc?: string; ua?: string; ip?: string };
    if (t.fbp) u.fbp = t.fbp;
    if (t.fbc) u.fbc = t.fbc;
    if (t.ua) u.client_user_agent = t.ua;
    if (t.ip) u.client_ip_address = t.ip;
  } catch { /* tracking is best-effort; the hashed identifiers above still go out */ }
  return u;
}
