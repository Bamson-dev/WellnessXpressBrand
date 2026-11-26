import { site, naira } from "@/lib/site";
import { getCategories, listProducts, priceRange } from "@/lib/catalog";
import { publishedGuides } from "@/lib/guides";
import { getContact } from "@/lib/settings";

export const dynamic = "force-dynamic";

/*
 * llms.txt: a short, factual map of the public site for AI assistants and answer engines (llmstxt.org format).
 * It does not replace robots.txt or the sitemap, and it lists only public pages. Built from the live catalogue.
 */
export async function GET() {
  if (process.env.COMING_SOON === "true") return new Response("Not found", { status: 404 });
  const c = getContact();
  const products = listProducts({ perPage: 500 }).items.filter((p) => !p.noindex);
  const line = (p: (typeof products)[number]) => {
    const r = priceRange(p);
    const price = r ? (r.min === r.max ? naira(r.min) : `from ${naira(r.min)}`) : "";
    const about = p.shortDescription.replace(/\s+/g, " ").trim();
    return `- [${p.name}](${site.url}/product/${p.slug})${about || price ? ":" : ""}${about ? ` ${about}` : ""}${price ? ` Price: ${price}.` : ""}`;
  };
  const guides = publishedGuides();
  const body = `# ${site.name}

> ${site.name} is an online store in Nigeria for WellnessXpress weight-management and wellness products, sold as individual products and combo sets. Customers order without an account, pay by bank transfer and get delivery across Nigeria. Prices are in Nigerian Naira (NGN).

Products are wellness products, not medicines. Product pages describe what is in each pack. The store does not claim that any product treats or cures a medical condition.

## Shop
- [All products](${site.url}/shop)
${getCategories().filter((x) => !x.noindex).map((x) => `- [${x.name}](${site.url}/category/${x.slug})${x.description ? `: ${x.description.replace(/\s+/g, " ").trim()}` : ""}`).join("\n")}

## Products
${products.map(line).join("\n")}
${guides.length ? `\n## Guides\n${guides.map((g) => `- [${g.title}](${site.url}/guides/${g.slug}): ${g.description}`).join("\n")}\n` : ""}
## Help and policies
- [FAQs](${site.url}/faq)
- [Shipping and delivery](${site.url}/shipping)
- [Returns and refunds](${site.url}/returns)
- [Product information and safety](${site.url}/product-information)
- [Privacy policy](${site.url}/privacy)
- [Terms and conditions](${site.url}/terms)
- [About ${site.name}](${site.url}/about)
- [Contact](${site.url}/contact)${c.email ? `: ${c.email}` : ""}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600", "X-Robots-Tag": "noindex" } });
}
