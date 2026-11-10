import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
// Coming Soon period: only the home page is public. Restore the full list at launch (see git history).
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site.url + "/", changeFrequency: "weekly", priority: 1 }];
}
