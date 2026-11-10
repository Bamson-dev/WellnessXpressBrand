import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { getCategories, getProducts } from "@/lib/products";
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", "/shop", "/about", "/contact", "/faq", "/privacy", "/terms", "/shipping", "/returns"];
  return [
    ...staticPaths.map((p) => ({ url: site.url + p, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...getCategories().map((c) => ({ url: `${site.url}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...getProducts().map((p) => ({ url: `${site.url}/product/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
