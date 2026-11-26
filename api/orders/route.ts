import { cookies } from "next/headers";
import { createOrder } from "@/lib/orders";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Places an order for manual bank transfer. The order starts as Pending Payment.
 * Nothing here can mark an order paid. Prices and delivery fees are computed on the server.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("or:" + ipOf(req), 6)) return Response.json({ error: "Too many orders from this connection. Wait a minute and try again." }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  if (typeof b.company === "string" && b.company) return Response.json({ error: "Invalid request." }, { status: 400 }); // honeypot
  const c = await cookies();
  try {
    const r = createOrder({
      ...b,
      tracking: { fbp: c.get("_fbp")?.value, fbc: c.get("_fbc")?.value, ua: req.headers.get("user-agent") || "", ip: ipOf(req) },
    });
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true, number: r.number, token: r.token, total: r.total, subtotal: r.subtotal, itemsSubtotal: r.itemsSubtotal, discountAmount: r.discountAmount, couponCode: r.couponCode, deliveryFee: r.fee, duplicate: r.duplicate });
  } catch (e) {
    const m = (e as Error).message || "";
    if (/UNIQUE.*client_key/i.test(m)) {
      // Two identical submissions arrived at the same moment: the first one created the order.
      const again = createOrder({ ...b });
      if (again.ok) return Response.json({ ok: true, number: again.number, token: again.token, total: again.total, subtotal: again.subtotal, deliveryFee: again.fee });
    }
    if (m === "delivery_fee_missing") return Response.json({ errors: { state: "Delivery fee for this state is not configured yet. Please contact us on WhatsApp." } }, { status: 400 });
    if (m.startsWith("coupon:")) return Response.json({ errors: { coupon: m.slice(7) } }, { status: 400 });
    if (m.startsWith("stock:")) return Response.json({ errors: { items: `${m.slice(6)} just went out of stock. Update your cart.` } }, { status: 409 });
    console.error("order create failed", m);
    return Response.json({ error: "We could not place your order. Try again, or message us on WhatsApp." }, { status: 500 });
  }
}
