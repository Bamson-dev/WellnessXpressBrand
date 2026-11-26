import "server-only";
import { randomBytes } from "crypto";
import { db, tx } from "@/lib/db";
import { getBank } from "@/lib/settings";
import { NIGERIAN_STATES, normalisePhone } from "@/lib/site";
import { clean } from "@/lib/validate";
import { notifyAdmin } from "@/lib/admin-events";

/*
 * Pre-payment order funnel (landing page -> order form -> pending order -> bank transfer -> admin marks Paid).
 * Orders go into the normal orders table as pending_payment. The price is fixed here, never read from the browser.
 * Attribution is stored in orders.tracking (JSON) with funnel:"3in1", so no schema change is needed.
 */
export const FUNNEL = {
  slug: "3in1",
  name: "WellnessX General Fat Loss 3-in-1 Combo",
  label: "Tummy Balance, Metabolic Reset, Flat Tummy Seed",
  sku: "WX-3IN1-COMBO",
  price: 30000,
  regular: 54000,
};
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function orderNumber() {
  const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const b = randomBytes(5);
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPH[b[i] % ALPH.length];
  return `WX${ymd}-${s}`;
}

export type Touch = { source?: string; medium?: string; campaign?: string; content?: string; term?: string; fbclid?: string; ttclid?: string; fbp?: string; fbc?: string; ttp?: string; at?: string };
export type Platform = "facebook" | "tiktok" | "organic" | "direct" | "unknown";
const T = (v: unknown, n = 100) => { const s = clean(v, n); return s || undefined; };
const CLICK = /^[\w.-]{5,300}$/;

export function cleanTouch(raw: unknown): Touch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t: Touch = {
    source: T(r.source ?? r.utm_source)?.toLowerCase(), medium: T(r.medium ?? r.utm_medium)?.toLowerCase(), campaign: T(r.campaign ?? r.utm_campaign),
    content: T(r.content ?? r.utm_content), term: T(r.term ?? r.utm_term),
    fbclid: typeof r.fbclid === "string" && CLICK.test(r.fbclid) ? r.fbclid : undefined,
    ttclid: typeof r.ttclid === "string" && CLICK.test(r.ttclid) ? r.ttclid : undefined,
    fbp: typeof r.fbp === "string" && /^fb\.\d\.\d+\.[\w-]{5,300}$/.test(r.fbp) ? r.fbp : undefined,
    fbc: typeof r.fbc === "string" && /^fb\.\d\.\d+\.[\w-]{5,300}$/.test(r.fbc) ? r.fbc : undefined,
    ttp: typeof r.ttp === "string" && /^[\w.-]{5,100}$/.test(r.ttp) ? r.ttp : undefined,
    at: T(r.at, 30),
  };
  return t;
}
const empty = (t: Touch | null) => !t || !(t.source || t.medium || t.campaign || t.content || t.term || t.fbclid || t.ttclid);

/** Platform of a touch, from what the visitor's link actually carried. Never guessed. */
export function platformOf(t: Touch | null): Platform {
  if (!t) return "unknown";
  const s = t.source || "";
  if (/^(facebook|fb|instagram|ig|meta)/.test(s) || (!s && t.fbclid)) return "facebook";
  if (/^tiktok|^tt$/.test(s) || (!s && t.ttclid)) return "tiktok";
  if (t.ttclid && !t.fbclid && !s) return "tiktok";
  if (s === "organic" || t.medium === "organic") return "organic";
  if (s) return "unknown";
  return "direct";
}

/** Parses the wx_attr cookie written on the landing page: {first:{...},last:{...}} as JSON. */
export function parseAttrCookie(v: string | undefined) {
  if (!v) return { first: null as Touch | null, last: null as Touch | null, present: false };
  try {
    const j = JSON.parse(decodeURIComponent(v));
    return { first: cleanTouch(j.first), last: cleanTouch(j.last), present: true };
  } catch { return { first: null, last: null, present: false }; }
}

export type FunnelInput = {
  name: unknown; phone: unknown; state: unknown; address: unknown; clientKey?: unknown;
  attr: { first: Touch | null; last: Touch | null; present: boolean };
  ids: { fbp?: string; fbc?: string; ttp?: string; ua?: string; ip?: string };
};

export function createFunnelOrder(input: FunnelInput) {
  const errors: Record<string, string> = {};
  const name = clean(input.name, 100);
  const phone = normalisePhone(clean(input.phone, 30));
  const state = clean(input.state, 40);
  const address = clean(input.address, 300);
  if (name.length < 2) errors.name = "Enter your full name.";
  if (!phone) errors.phone = "Enter a valid Nigerian WhatsApp number, for example 0803 123 4567.";
  if (!NIGERIAN_STATES.includes(state)) errors.state = "Choose your state.";
  if (address.length < 8) errors.address = "Enter your full delivery address.";
  const clientKey = /^[A-Za-z0-9_-]{16,64}$/.test(String(input.clientKey || "")) ? String(input.clientKey) : "";
  if (clientKey) {
    const ex = db().prepare("SELECT number, access_token, total FROM orders WHERE client_key = ?").get(clientKey);
    if (ex) return { ok: true as const, duplicate: true, number: String(ex.number), token: String(ex.access_token), total: Number(ex.total) };
  }
  if (Object.keys(errors).length) return { ok: false as const, errors };

  const first = input.attr.first, last = input.attr.last || input.attr.first;
  const platform = platformOf(empty(last) && !input.attr.present ? null : last);
  const ok = (v: unknown) => typeof v === "string" && /^fb\.\d\.\d+\.[\w-]+$/.test(v) ? v : undefined;
  let fbc = ok(input.ids.fbc) || ok(last?.fbc) || ok(first?.fbc);
  const fbclid = last?.fbclid || first?.fbclid;
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  const tracking = {
    funnel: FUNNEL.slug, platform, first, last,
    fbp: ok(input.ids.fbp) || ok(last?.fbp) || ok(first?.fbp), fbc, ttp: (input.ids.ttp && /^[\w.-]{5,100}$/.test(input.ids.ttp) ? input.ids.ttp : undefined) || last?.ttp || first?.ttp,
    ttclid: last?.ttclid || first?.ttclid, ua: clean(input.ids.ua, 400) || undefined, ip: clean(input.ids.ip, 45) || undefined,
  };
  const bank = getBank();
  return tx((d) => {
    let number = orderNumber();
    while (d.prepare("SELECT 1 FROM orders WHERE number = ?").get(number)) number = orderNumber();
    const token = randomBytes(24).toString("base64url");
    const r = d.prepare(
      `INSERT INTO orders (number,access_token,customer_name,phone,whatsapp,email,state,city,address,instructions,subtotal,delivery_fee,total,delivery_payment_status,
         delivery_eta,delivery_fee_source,client_key,bank_snapshot,tracking,discount_amount,coupon_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(number, token, name, phone, phone, "", state, state, address, "", FUNNEL.price, 0, FUNNEL.price, "not_required", "1–3 working days", "included_in_order", clientKey, JSON.stringify(bank), JSON.stringify(tracking), 0, "");
    const oid = Number(r.lastInsertRowid);
    d.prepare("INSERT INTO order_items (order_id,product_id,variant_id,name,variant_label,sku,unit_price,qty,line_total,discount_amount) VALUES (?,?,?,?,?,?,?,?,?,0)")
      .run(oid, null, null, FUNNEL.name, FUNNEL.label, FUNNEL.sku, FUNNEL.price, 1, FUNNEL.price);
    d.prepare("INSERT INTO order_events (order_id,actor,action,note) VALUES (?,?,?,?)")
      .run(oid, "customer", "order_placed", `Landing page order (3-in-1). Source: ${platform}${last?.campaign ? ", campaign " + last.campaign : ""}. Pending payment.`);
    notifyAdmin(`order:${oid}:created`, "new_order", "New funnel order (pending payment)", `${number} · ${name} · ${state} · ${platform}`, `/admin/orders/${oid}`);
    return { ok: true as const, duplicate: false, number, token, total: FUNNEL.price, orderId: oid, phone, tracking };
  });
}

export const SOURCE_FILTERS = ["facebook", "tiktok", "organic", "direct", "unknown", "store"] as const;

/** Orders, payment confirmations, paid orders and revenue per platform. Orders without a funnel marker count as "store". */
export function sourceStats() {
  return db().prepare(
    `SELECT COALESCE(json_extract(tracking,'$.platform'),'store') AS src, COUNT(*) AS orders,
       SUM(CASE WHEN payment_status IN ('awaiting_verification','paid') THEN 1 ELSE 0 END) AS confirmations,
       SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
       COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END),0) AS revenue
     FROM orders WHERE fulfilment_status != 'cancelled' GROUP BY src ORDER BY orders DESC`
  ).all() as { src: string; orders: number; confirmations: number; paid: number; revenue: number }[];
}
