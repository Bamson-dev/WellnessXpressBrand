import { createHash } from "crypto";
import { quoteLines } from "@/lib/catalog";
import { validateCoupon } from "@/lib/coupons";
import { ipOf, limited, sameOrigin } from "@/lib/ratelimit";
import { normalisePhone } from "@/lib/site";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid request." }, { status: 403 });
  if (limited(`coupon:${ipOf(req)}`, 20)) return Response.json({ error: "Too many coupon checks. Please wait a moment." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.items)) return Response.json({ error: "Add products to your cart before applying a coupon." }, { status: 400 });
  const lines = quoteLines(body.items.map((item: { variantId: unknown; qty: unknown }) => ({ variantId: Number(item?.variantId), qty: Number(item?.qty) })));
  if (!lines.length || lines.length !== body.items.length || lines.some((line) => !line.available)) return Response.json({ error: "Update your cart before applying a coupon." }, { status: 400 });
  const phone = normalisePhone(String(body.phone || ""));
  const key = phone ? `phone:${createHash("sha256").update(phone).digest("hex")}` : "";
  const result = validateCoupon(body.code, lines.map((line) => ({ productId: line.productId, variantId: line.variantId, lineTotal: line.lineTotal })), key);
  return result.ok ? Response.json(result, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
