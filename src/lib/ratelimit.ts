const hits = new Map<string, number[]>();
/** Simple in-memory limiter: max `limit` requests per `windowMs` per key. */
export function limited(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}
export const ipOf = (req: Request | { headers: Headers }) =>
  (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

/** Rejects cross-site POSTs to JSON/form endpoints. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return o.host === host;
  } catch {
    return false;
  }
}
