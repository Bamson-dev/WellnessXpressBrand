const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

/** Process-local limiter: max `limit` requests per `windowMs` per key. */
export function limited(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);

  // Keep memory bounded without clearing every active user's limits at once.
  if (hits.size > MAX_KEYS) {
    for (const [k, timestamps] of hits) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] >= windowMs) hits.delete(k);
    }
    if (hits.size > MAX_KEYS) {
      const oldest = [...hits.entries()].sort((a, b) => (a[1][0] || 0) - (b[1][0] || 0));
      for (const [k] of oldest.slice(0, hits.size - MAX_KEYS)) hits.delete(k);
    }
  }
  return arr.length > limit;
}

/**
 * Client address for rate limiting. Cloudflare sets cf-connecting-ip.
 * Otherwise use the LAST X-Forwarded-For entry, which our own reverse proxy (Traefik) appends;
 * earlier entries come from the client and can be faked.
 */
export const ipOf = (req: Request | { headers: Headers }) => {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const xff = (req.headers.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return (xff[xff.length - 1] || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
};

/** Rejects cross-site POSTs to JSON/form endpoints. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return !!host && o.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
