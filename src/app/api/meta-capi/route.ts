import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side Meta Conversions API relay.
 * Receives the same events the browser Pixel fires (matched by event_id for deduplication)
 * and forwards them to Meta. The access token exists only as a server environment variable.
 *
 * Required env (Coolify): META_CAPI_ACCESS_TOKEN
 * Optional env: META_PIXEL_ID (default below), META_CAPI_TEST_EVENT_CODE, META_GRAPH_VERSION
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PIXEL_ID = "29204690629182298";
const ALLOWED_EVENTS = new Set(["PageView", "ViewContent", "TelegramJoinClick"]);
const ALLOWED_ORIGINS = new Set([
  "https://weightloss.wellnessxpressbrand.com",
  "https://wellnessxpressbrand.com",
]);
const EVENT_ID = /^[a-z]{2}_\d{10,14}_[a-z0-9]{4,16}$/;

const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60000) {
    hits.set(ip, { n: 1, t: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.n += 1;
  return h.n > 30;
}

function cors(origin: string | null) {
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers });
  }

  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }

  let body: Record<string, unknown>;
  try {
    // sendBeacon posts text/plain, so parse the raw text instead of relying on content-type.
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400, headers });
  }

  const eventName = String(body.event_name || "");
  const eventId = String(body.event_id || "");
  if (!ALLOWED_EVENTS.has(eventName) || !EVENT_ID.test(eventId)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400, headers });
  }

  let safeUrl = "https://weightloss.wellnessxpressbrand.com/masterclass/";
  try {
    const u = new URL(String(body.event_source_url || ""));
    if (ALLOWED_ORIGINS.has(u.origin)) safeUrl = u.origin + u.pathname;
  } catch {}

  const cookie = (v: unknown) => (typeof v === "string" && /^[\w.\-]{1,200}$/.test(v) ? v : undefined);
  const userData: Record<string, string> = {
    client_user_agent: req.headers.get("user-agent") || "",
  };
  if (ip !== "unknown") userData.client_ip_address = ip;
  const fbp = cookie(body.fbp);
  const fbc = cookie(body.fbc);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const custom: Record<string, string> = {};
  const cd = (body.custom_data || {}) as Record<string, unknown>;
  for (const k of ["content_name", "content_category", "button_text", "page_path"]) {
    if (typeof cd[k] === "string") custom[k] = (cd[k] as string).slice(0, 120);
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: safeUrl,
    action_source: "website",
    user_data: userData,
    custom_data: custom,
  };

  const payload: Record<string, unknown> = { data: [event] };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const ver = process.env.META_GRAPH_VERSION ? "/" + process.env.META_GRAPH_VERSION : "";
  try {
    const r = await fetch("https://graph.facebook.com" + ver + "/" + pixelId + "/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.error("meta-capi: Meta responded", r.status, eventName);
      return NextResponse.json({ ok: false }, { status: 502, headers });
    }
    const j = (await r.json().catch(() => ({}))) as { events_received?: number };
    return NextResponse.json({ ok: true, events_received: j.events_received ?? 0 }, { headers });
  } catch {
    console.error("meta-capi: request failed", eventName);
    return NextResponse.json({ ok: false }, { status: 502, headers });
  }
}
