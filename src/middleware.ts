import { NextResponse, type NextRequest } from "next/server";

/**
 * Coming Soon mode. While active, every public URL renders /coming-soon.
 * The storefront code stays in src/app/(store) and returns when COMING_SOON=false
 * is set in Coolify and the app is redeployed.
 */
const PASS = ["/api/health", "/api/newsletter", "/coming-soon", "/robots.txt", "/sitemap.xml", "/icon.svg", "/favicon.ico"];

export function middleware(req: NextRequest) {
  if (process.env.COMING_SOON === "false") return NextResponse.next();
  const { pathname } = req.nextUrl;

  if (PASS.includes(pathname)) return NextResponse.next();

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
