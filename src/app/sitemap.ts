import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { listProducts, CATEGORIES } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (p: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({ url: site.url + p, changeFrequency: "weekly", priority });
  // During Coming Soon only the home page is public.
  if (process.env.COMING_SOON !== "false") return [u("/", 1)];
  const products = listProducts({ perPage: 500 }).items;
  return [
    u("/", 1), u("/shop", 0.9), ...CATEGORIES.map((c) => u(`/category/${c.slug}`, 0.8)),
    ...products.map((p) => ({ ...u(`/product/${p.slug}`, 0.8), lastModified: p.updatedAt.replace(" ", "T") + "Z" })),
    u("/about", 0.4), u("/contact", 0.4), u("/faq", 0.5), u("/product-information", 0.3),
    u("/shipping", 0.3), u("/returns", 0.3), u("/privacy", 0.2), u("/terms", 0.2),
  ];
}
