import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { db } from "@/lib/db";
import { SESSION_COOKIE, signSession, verifySession, adminConfigured, type Session } from "@/lib/session";

export function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 64);
  return "scrypt$" + salt.toString("hex") + "$" + h.toString("hex");
}
function checkHash(pw: string, stored: string) {
  const [alg, salt, hex] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hex) return false;
  const h = scryptSync(pw, Buffer.from(salt, "hex"), 64);
  const want = Buffer.from(hex, "hex");
  return want.length === h.length && timingSafeEqual(h, want);
}
const sameText = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export async function login(email: string, password: string): Promise<Session | null> {
  if (!adminConfigured()) return null;
  const e = email.trim().toLowerCase();
  const ownerEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const ownerOk = sameText(e, ownerEmail) && sameText(password, process.env.ADMIN_PASSWORD || "");
  let s: Omit<Session, "exp"> | null = null;
  if (ownerOk) s = { uid: "owner", email: ownerEmail, name: "Owner", role: "owner" };
  else {
    const u = db().prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(e);
    if (u && checkHash(password, String(u.password_hash))) s = { uid: String(u.id), email: String(u.email), name: String(u.name), role: u.role as "owner" | "staff" };
  }
  if (!s) return null;
  const token = await signSession(s);
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return { ...s, exp: Date.now() + 12 * 3600_000 };
}

export function logout() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function currentAdmin(): Promise<Session | null> {
  const s = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!s) return null;
  if (s.uid !== "owner") {
    const u = db().prepare("SELECT active, role FROM users WHERE id = ?").get(Number(s.uid));
    if (!u || Number(u.active) !== 1) return null;
    s.role = u.role as "owner" | "staff";
  }
  return s;
}

/** Use at the top of every admin page and server action. Redirects to login when there is no valid session. */
export async function requireAdmin(role: "owner" | "staff" = "staff"): Promise<Session> {
  const s = await currentAdmin();
  if (!s) redirect("/admin/login");
  if (role === "owner" && s.role !== "owner") redirect("/admin?denied=1");
  return s;
}
