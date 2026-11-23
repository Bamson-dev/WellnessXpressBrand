import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { listProducts, getCategories } from "@/lib/catalog";
import { publishedGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";

/**
 * Built on every request from the live catalogue, so new or hidden products and guides update it automatically.
 * Only canonical, indexable public pages: no admin, API, cart, checkout, order, filtered or search URLs.
 * With fewer than a few thousand URLs one file is enough; switch to generateSitemaps() if the catalogue grows past ~40,000.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const u = (p: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({ url: site.url + p, changeFrequency: "weekly", priority });
  // During Coming Soon only the home page is public.
  if (process.env.COMING_SOON === "true") return [u("/", 1)];
  const abs = (src: string) => (/^https?:\/\//.test(src) ? src : site.url + (src.startsWith("/") ? src : `/${src}`));
  const products = listProducts({ perPage: 500 }).items.filter((p) => !p.noindex);
  const guides = publishedGuides();
  return [
    u("/", 1), u("/shop", 0.9), ...getCategories().filter((c) => !c.noindex).map((c) => u(`/category/${c.slug}`, 0.8)),
    ...products.map((p) => ({
      ...u(`/product/${p.slug}`, 0.8),
      lastModified: p.updatedAt.replace(" ", "T") + "Z",
      images: [...new Set(p.images.filter(Boolean).map(abs))].slice(0, 10),
    })),
    ...(guides.length ? [u("/guides", 0.6)] : []),
    ...guides.map((g) => ({ ...u(`/guides/${g.slug}`, 0.6), lastModified: g.updated, changeFrequency: "monthly" as const })),
    u("/about", 0.4), u("/contact", 0.4), u("/faq", 0.5), u("/product-information", 0.3),
    u("/shipping", 0.3), u("/returns", 0.3), u("/privacy", 0.2), u("/terms", 0.2),
  ];
}
