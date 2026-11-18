import { quoteLines } from "@/lib/catalog";
import { deliveryFeeFor } from "@/lib/settings";
import { NIGERIAN_STATES } from "@/lib/site";
import { ipOf, limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (limited("q:" + ipOf(req), 60)) return Response.json({ error: "Too many requests." }, { status: 429 });
  const b = await req.json().catch(() => null);
  const items = Array.isArray(b?.items) ? b.items : [];
  const lines = quoteLines(items.map((i: { variantId: unknown; qty: unknown }) => ({ variantId: Number(i?.variantId), qty: Number(i?.qty) })));
  const subtotal = lines.filter((l) => l.available).reduce((s, l) => s + l.lineTotal, 0);
  const state = typeof b?.state === "string" && NIGERIAN_STATES.includes(b.state) ? b.state : null;
  const fee = state ? deliveryFeeFor(state) : null;
  return Response.json({ lines, subtotal, state, deliveryFee: fee, total: state && fee != null ? subtotal + fee : null }, { headers: { "Cache-Control": "no-store" } });
}
