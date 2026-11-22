import { quoteLines } from "@/lib/catalog";
import { deliveryQuote } from "@/lib/settings";
import { NIGERIAN_STATES } from "@/lib/site";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Server quote for the cart. Product prices and the delivery fee both come from the database.
 * Product payment (subtotal) and delivery payment (fee) stay separate amounts.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited("q:" + ipOf(req), 60)) return Response.json({ error: "Too many requests." }, { status: 429 });
  const b = await req.json().catch(() => null);
  const items = Array.isArray(b?.items) ? b.items : [];
  const lines = quoteLines(items.map((i: { variantId: unknown; qty: unknown }) => ({ variantId: Number(i?.variantId), qty: Number(i?.qty) })));
  const subtotal = lines.filter((l) => l.available).reduce((s, l) => s + l.lineTotal, 0);
  const state = typeof b?.state === "string" && (NIGERIAN_STATES.includes(b.state) || b.state === "Office Pickup") ? b.state : null;
  const city = typeof b?.city === "string" ? b.city.trim().slice(0, 80) : "";
  const delivery = state ? deliveryQuote(state, subtotal, city) : null;
  return Response.json(
    { lines, subtotal, state, delivery, deliveryFee: delivery?.available ? delivery.fee : null, payNow: subtotal, total: delivery?.available ? subtotal + (delivery.fee as number) : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
