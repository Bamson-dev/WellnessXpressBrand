import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { db } from "@/lib/db";
import { SESSION_COOKIE, signSession, verifySession, adminConfigured, type Session } from "@/lib/session";
import { ALL_PERMISSIONS, parsePermissions, type Permission } from "@/lib/permissions";

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
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return { ...s, exp: Date.now() + 12 * 3600_000 };
}

export async function logout() {
  const c = await cookies();
  const s = await verifySession(c.get(SESSION_COOKIE)?.value);
  if (s?.sid) {
    const d = db();
    d.prepare("DELETE FROM revoked_sessions WHERE expires_at < ?").run(Date.now());
    d.prepare("INSERT OR IGNORE INTO revoked_sessions (sid, expires_at) VALUES (?, ?)").run(s.sid, s.exp);
  }
  c.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export type Admin = Session & { perms: Permission[] };

/** The signed-in admin. Role and permissions are read from the database on every request, so revoking takes effect at once. */
export async function currentAdmin(): Promise<Admin | null> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  // Signed-out sessions stay invalid until they expire; sessions without an id predate server-side logout.
  if (!s.sid || db().prepare("SELECT 1 FROM revoked_sessions WHERE sid = ?").get(s.sid)) return null;
  if (s.uid === "owner") return { ...s, role: "owner", perms: [...ALL_PERMISSIONS] };
  const u = db().prepare("SELECT active, role, permissions FROM users WHERE id = ?").get(Number(s.uid));
  if (!u || Number(u.active) !== 1) return null;
  const role = u.role === "owner" ? "owner" : "staff";
  return { ...s, role, perms: role === "owner" ? [...ALL_PERMISSIONS] : parsePermissions(u.permissions) };
}

export const can = (a: { role: string; perms?: string[] } | null | undefined, p: Permission) => !!a && (a.role === "owner" || !!a.perms?.includes(p));

/** Server-side permission check for pages and server actions. Redirects when the admin lacks the permission. */
export async function requirePerm(...any: Permission[]): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  if (!any.some((p) => can(a, p))) redirect("/admin?denied=1");
  return a;
}

/** Use at the top of every admin page and server action. Redirects to login when there is no valid session. */
export async function requireAdmin(role: "owner" | "staff" = "staff"): Promise<Admin> {
  const s = await currentAdmin();
  if (!s) redirect("/admin/login");
  if (role === "owner" && s.role !== "owner") redirect("/admin?denied=1");
  return s;
}
