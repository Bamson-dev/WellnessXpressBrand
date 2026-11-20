/*
 * Admin session tokens. Uses Web Crypto only, so it runs in both the Node server and the Edge middleware.
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256). The key comes from ADMIN_SESSION_SECRET,
 * or is derived from ADMIN_PASSWORD when no separate secret is set. Nothing secret is sent to the browser.
 */
export const SESSION_COOKIE = "wx_admin";
export type Session = { uid: string; email: string; name: string; role: "owner" | "staff"; exp: number; perms?: string[]; sid?: string };

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

let warned = false;
/**
 * Signing key for admin sessions. Use ADMIN_SESSION_SECRET (32+ random characters). Without it the key is derived
 * from ADMIN_PASSWORD so the dashboard keeps working, and a warning is logged once (the secret itself is never logged).
 * A configured secret that is too short is refused, which keeps admin sign-in closed rather than weakly protected.
 */
function secret() {
  const own = process.env.ADMIN_SESSION_SECRET || "";
  if (own) return own.length >= 32 ? own : "";
  if (!warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn("[admin] ADMIN_SESSION_SECRET is not set; sessions are signed with a key derived from ADMIN_PASSWORD. Set a 32+ character random secret.");
  }
  const s = process.env.ADMIN_PASSWORD ? "wx-session:" + process.env.ADMIN_PASSWORD : "";
  return s.length >= 12 ? s : "";
}

async function key() {
  const s = secret();
  if (!s) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(p: Omit<Session, "exp">, hours = 12) {
  const k = await key();
  if (!k) throw new Error("Admin access is not configured");
  const sid = b64u(crypto.getRandomValues(new Uint8Array(18)));
  const body = b64u(enc.encode(JSON.stringify({ ...p, sid, exp: Date.now() + hours * 3600_000 })));
  const sig = b64u(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
  return body + "." + sig;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const k = await key();
  if (!k) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", k, unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body))) as Session;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export const adminConfigured = () => !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && secret());
