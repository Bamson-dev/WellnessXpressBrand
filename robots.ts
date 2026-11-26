import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { getSeo } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (getSeo().noindexSite) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/checkout", "/cart", "/order/"] }], sitemap: `${site.url}/sitemap.xml` };
}
