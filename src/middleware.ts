import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * 1. Coming Soon mode: only while COMING_SOON is "true", every public URL renders /coming-soon.
 *    The admin dashboard stays reachable so the owner can prepare products, delivery fees and bank details,
 *    and a signed-in admin can preview the full store.
 * 2. Private order links: /order/<number>?t=<token> stores the token in an httpOnly cookie and redirects to the
 *    clean URL, so the token never appears in analytics or pixel page URLs.
 */
const PASS = ["/api/health", "/api/newsletter", "/api/meta-capi", "/coming-soon", "/robots.txt", "/sitemap.xml", "/icon.svg", "/favicon.ico", "/og.png", "/og.jpg"];

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  const m = /^\/order\/(WX\d{6}-[A-Z0-9]{5})$/.exec(pathname);
  const t = searchParams.get("t");
  if (m && t && /^[A-Za-z0-9_-]{20,64}$/.test(t)) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("t");
    // Build the public URL from the proxy headers so the redirect never points at the internal container host.
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host).split(",")[0].trim();
    const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
    const res = NextResponse.redirect(`${proto}://${host}${pathname}${rest.toString() ? "?" + rest : ""}`, 303);
    res.cookies.set(`wx_ot_${m[1]}`, t, { httpOnly: true, sameSite: "lax", secure: (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")) === "https", path: pathname, maxAge: 60 * 60 * 24 * 120 });
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  if (process.env.COMING_SOON !== "true") return NextResponse.next();
  if (PASS.includes(pathname) || pathname.startsWith("/brand/") || pathname.startsWith("/admin") || pathname.startsWith("/api/admin/")) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "This feature is not available during the Coming Soon period." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/coming-soon";
  url.search = "";
  const res = NextResponse.rewrite(url);
  if (pathname !== "/") res.headers.set("X-Robots-Tag", "noindex, follow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|images/).*)"],
};
