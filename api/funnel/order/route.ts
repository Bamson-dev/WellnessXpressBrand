import { cookies } from "next/headers";
import { createFunnelOrder, cleanTouch, parseAttrCookie } from "@/lib/funnel";
import { sendMetaFunnel } from "@/lib/capi-funnel";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Creates a Pending Payment order from the landing page funnel. Nothing here marks an order paid or sends a Purchase. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("fo:" + ipOf(req), 6)) return Response.json({ error: "Too many orders from this connection. Wait a minute and try again." }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  if (typeof b.company === "string" && b.company) return Response.json({ error: "Invalid request." }, { status: 400 });
  const c = await cookies();
  let attr = parseAttrCookie(c.get("wx_attr")?.value);
  if (!attr.present && b.attr && typeof b.attr === "object") {
    // Fallback: parameters present in this page's own address when the landing cookie is missing.
    const t = cleanTouch(b.attr);
    attr = { first: t, last: t, present: true };
  }
  try {
    const r = createFunnelOrder({
      name: b.name, phone: b.phone, state: b.state, address: b.address, clientKey: b.clientKey, attr,
      ids: { fbp: c.get("_fbp")?.value, fbc: c.get("_fbc")?.value, ttp: c.get("_ttp")?.value, ua: req.headers.get("user-agent") || "", ip: ipOf(req) },
    });
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    if (!r.duplicate && "tracking" in r) {
      // Lead = order submitted, not paid. Sent in the background and never blocks the customer.
      void sendMetaFunnel({ name: "Lead", eventId: "ld_" + r.number, number: r.number, phone: r.phone, value: r.total, url: `${site.url}/order/${r.number}`, tracking: JSON.stringify(r.tracking) }).catch(() => {});
    }
    return Response.json({ ok: true, number: r.number, token: r.token, duplicate: r.duplicate });
  } catch (e) {
    const m = (e as Error).message || "";
    if (/UNIQUE.*client_key/i.test(m)) return Response.json({ error: "Your order is already being processed. Check your WhatsApp or try again in a minute." }, { status: 409 });
    console.error("funnel order failed", m);
    return Response.json({ error: "We could not place your order. Try again, or message us on WhatsApp." }, { status: 500 });
  }
}
