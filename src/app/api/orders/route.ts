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
  const c = cookies();
  try {
    const r = createOrder({
      ...b,
      tracking: { fbp: c.get("_fbp")?.value, fbc: c.get("_fbc")?.value, ua: req.headers.get("user-agent") || "", ip: ipOf(req) },
    });
    if (!r.ok) return Response.json({ errors: r.errors }, { status: 400 });
    return Response.json({ ok: true, number: r.number, token: r.token, total: r.total, subtotal: r.subtotal, deliveryFee: r.fee });
  } catch (e) {
    const m = (e as Error).message || "";
    if (m.startsWith("stock:")) return Response.json({ errors: { items: `${m.slice(6)} just went out of stock. Update your cart.` } }, { status: 409 });
    if (m === "delivery:disabled") return Response.json({ errors: { state: "Delivery is not currently available in the selected state. Contact us for help." } }, { status: 400 });
    if (m === "delivery:unconfigured") return Response.json({ errors: { state: "Delivery pricing is not available for the selected state yet. Please choose another state or contact us." } }, { status: 400 });
    console.error("order create failed", m);
    return Response.json({ error: "We could not place your order. Try again, or message us on WhatsApp." }, { status: 500 });
  }
}
