import { randomUUID } from "crypto";
import { appendRecord } from "@/lib/storage";
import { getProductBySku, effectivePrice } from "@/lib/products";
import { isEmail, isPhone, str } from "@/lib/validate";
import { ipOf, limited } from "@/lib/ratelimit";

/**
 * Order requests are stored with status "awaiting_payment_setup".
 * No payment is taken and no order is ever marked paid here.
 * Prices come from the server catalogue, never from the browser.
 */
export async function POST(req: Request) {
  if (limited("or:" + ipOf(req), 5)) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const b = await req.json().catch(() => null);
  const errors: Record<string, string> = {};
  const name = str(b?.name, 100);
  const email = str(b?.email, 254).toLowerCase();
  const phone = str(b?.phone, 20);
  const address = str(b?.address, 300);
  const city = str(b?.city, 80);
  const state = str(b?.state, 80);
  const notes = str(b?.notes, 500);
  if (name.length < 2) errors.name = "Enter your full name.";
  if (!isEmail(email)) errors.email = "Enter a valid email address.";
  if (!isPhone(phone)) errors.phone = "Enter a valid phone number.";
  if (address.length < 5) errors.address = "Enter your delivery address.";
  if (city.length < 2) errors.city = "Enter your city.";
  if (state.length < 2) errors.state = "Enter your state.";

  const rawItems = Array.isArray(b?.items) ? b.items.slice(0, 50) : [];
  const items: { sku: string; name: string; qty: number; unitPrice: number }[] = [];
  for (const it of rawItems) {
    const p = getProductBySku(str(it?.sku, 60));
    const qty = Number(it?.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      errors.items = "Your cart has an item that is no longer available. Review your cart.";
      continue;
    }
    if (p.availability === "out_of_stock") {
      errors.items = `${p.name} is out of stock.`;
      continue;
    }
    items.push({ sku: p.sku, name: p.name, qty, unitPrice: effectivePrice(p) });
  }
  if (!items.length && !errors.items) errors.items = "Your cart is empty.";
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const reference = "WX-" + randomUUID().slice(0, 8).toUpperCase();
  const saved = await appendRecord("orders.jsonl", {
    reference, status: "awaiting_payment_setup", paid: false,
    customer: { name, email, phone, address, city, state, notes }, items, subtotal,
  });
  if (!saved) return Response.json({ error: "Could not record your order request. Try again later." }, { status: 503 });
  return Response.json({
    ok: true, reference, subtotal, paid: false,
    paymentsEnabled: process.env.PAYMENTS_ENABLED === "true" ? "configured-but-no-provider" : false,
  });
}
