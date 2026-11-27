import { NextResponse, type NextRequest } from "next/server";
import { ipOf } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side Meta Conversions API relay.
 * Receives the same events the browser Pixel fires (matched by event_id for deduplication)
 * and forwards them to Meta. Access tokens exist only as server environment variables.
 *
 * Funnel routing (by validated event_source_url pathname):
 *   /whatsapp-weightloss/ → Edith Pixel 1 (META_PIXEL_ID_WHATSAPP, META_CAPI_ACCESS_TOKEN_WHATSAPP)
 *   all other permitted paths            → Telegram Pixel (META_PIXEL_ID / DEFAULT, META_CAPI_ACCESS_TOKEN)
 *
 * WhatsApp events are NEVER routed to Telegram credentials as a fallback.
 * If META_CAPI_ACCESS_TOKEN_WHATSAPP is absent the endpoint returns 500 and refuses the event.
 *
 * Required env (Coolify): META_CAPI_ACCESS_TOKEN, META_CAPI_ACCESS_TOKEN_WHATSAPP
 * Optional env: META_PIXEL_ID (default below), META_PIXEL_ID_WHATSAPP (default below),
 *               META_CAPI_TEST_EVENT_CODE, META_GRAPH_VERSION
 */

const DEFAULT_PIXEL_ID_TELEGRAM = "29204690629182298";
const DEFAULT_PIXEL_ID_WHATSAPP = "1290890196474517";
const WHATSAPP_PATH_PREFIX = "/whatsapp-weightloss/";

const ALLOWED_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "TelegramJoinClick",
  "WhatsAppJoinClick",
]);
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
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: cors(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  if (limited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400, headers });
  }

  const eventName = String(body.event_name || "");
  const eventId = String(body.event_id || "");
  if (!ALLOWED_EVENTS.has(eventName) || !EVENT_ID.test(eventId)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400, headers });
  }

  // Parse and validate event_source_url. Only accept URLs from permitted origins.
  let safeUrl: string;
  let sourcePath: string;
  try {
    const u = new URL(String(body.event_source_url || ""));
    if (!ALLOWED_ORIGINS.has(u.origin)) {
      return NextResponse.json({ error: "invalid_event_source_url" }, { status: 400, headers });
    }
    safeUrl = u.origin + u.pathname;
    sourcePath = u.pathname;
  } catch {
    return NextResponse.json({ error: "invalid_event_source_url" }, { status: 400, headers });
  }

  // Route to correct pixel/token. WhatsApp MUST NOT fall back to Telegram credentials.
  const isWhatsApp = sourcePath.startsWith(WHATSAPP_PATH_PREFIX);
  let resolvedPixelId: string;
  let resolvedToken: string;

  if (isWhatsApp) {
    resolvedPixelId =
      process.env.META_PIXEL_ID_WHATSAPP || DEFAULT_PIXEL_ID_WHATSAPP;
    resolvedToken = process.env.META_CAPI_ACCESS_TOKEN_WHATSAPP ?? "";
    if (!resolvedToken) {
      console.error(
        "[meta-capi] WhatsApp funnel: META_CAPI_ACCESS_TOKEN_WHATSAPP not configured. Event refused."
      );
      return NextResponse.json(
        { error: "tracking_not_configured" },
        { status: 500, headers }
      );
    }
  } else {
    resolvedPixelId =
      process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID_TELEGRAM;
    resolvedToken = process.env.META_CAPI_ACCESS_TOKEN ?? "";
    if (!resolvedToken) {
      return NextResponse.json(
        { error: "not_configured" },
        { status: 503, headers }
      );
    }
  }

  const userData: Record<string, unknown> = {};
  const rawFbc = String(body.fbc || "");
  const rawFbp = String(body.fbp || "");
  if (/^fb\.\d+\.\d+\.[A-Za-z0-9_-]{4,200}$/.test(rawFbc)) userData.fbc = rawFbc;
  if (/^fb\.\d+\.\d+\.[A-Za-z0-9_-]{4,200}$/.test(rawFbp)) userData.fbp = rawFbp;
  const serverIp = ipOf(req);
  const serverUa = req.headers.get("user-agent") || "";
  if (serverIp && serverIp !== "unknown") userData.client_ip_address = serverIp.slice(0, 45);
  if (serverUa) userData.client_user_agent = serverUa.slice(0, 500);

  const custom_data: Record<string, unknown> = {};
  if (body.content_name)
    custom_data.content_name = String(body.content_name).slice(0, 200);
  if (body.content_category)
    custom_data.content_category = String(body.content_category).slice(0, 200);

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: safeUrl,
    action_source: "website",
    user_data: userData,
  };
  if (Object.keys(custom_data).length > 0) event.custom_data = custom_data;

  const payload: Record<string, unknown> = { data: [event] };
  if (testCode) payload.test_event_code = testCode;

  const ver = "/" + (process.env.META_GRAPH_VERSION || "v21.0");

  const r = await fetch(
    "https://graph.facebook.com" + ver + "/" + resolvedPixelId + "/events",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + resolvedToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }
  ).catch((err: unknown) => {
    console.error("[meta-capi] fetch error", err);
    return null;
  });

  if (!r) {
    return NextResponse.json(
      { error: "upstream_error" },
      { status: 502, headers }
    );
  }

  if (!r.ok) {
    console.error("[meta-capi] Meta responded", r.status, eventName);
    return NextResponse.json({ ok: false }, { status: 502, headers });
  }

  const j = (await r.json().catch(() => ({}))) as {
    events_received?: number;
  };
  return NextResponse.json(
    { ok: true, events_received: j.events_received ?? 0 },
    { headers }
  );
}
