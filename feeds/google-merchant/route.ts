import { site } from "@/lib/site";
import { effective, getProduct, inStock, listProducts } from "@/lib/catalog";
import { plainText } from "@/components/RichText";
import { deliveryQuote, deliveryZones } from "@/lib/settings";
import { chargedDeliveryFee, LAGOS_MAX_FEE } from "@/lib/delivery-rates";

export const dynamic = "force-dynamic";

/*
 * Google Merchant Center product feed (RSS 2.0 with the g: namespace), one item per size/option.
 * Built from the live catalogue on every fetch, so prices and stock always match the product pages.
 * No GTINs are invented: identifier_exists is "no" because these products have no registered GTIN.
 * Shipping: Merchant Center only accepts state-level shipping (the region sub-attribute) for the US, Australia and Japan,
 * so a Nigeria-wide price is the most precise option Google offers. Google allows matching or slightly overestimating
 * shipping, never underestimating, so each item carries the highest fee any customer in Nigeria could pay for it under the
 * checkout rules (state fees, Lagos at its highest area fee, free from ₦50,000 except Abuja at ₦5,000).
 * Checkout still calculates and charges each customer's actual fee.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const abs = (src: string) => (/^https?:\/\//.test(src) ? src : site.url + (src.startsWith("/") ? src : `/${src}`));
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const transit = (eta: string) => { const m = /(\d+)\s*[–-]\s*(\d+)/.exec(eta); return m ? [Number(m[1]), Number(m[2])] : [1, 3]; };
/** Highest delivery fee and widest delivery time across every state the store delivers to, for one item priced `price`. */
function nigeriaShipping(price: number) {
  let fee: number | null = null; let tmin = 1; let tmax = 3;
  for (const z of deliveryZones()) {
    if (!z.active) continue;
    const f = z.state === "Lagos" ? chargedDeliveryFee("Lagos", LAGOS_MAX_FEE, price) : (() => { const q = deliveryQuote(z.state, price); return q.available ? q.fee : null; })();
    if (f == null) continue;
    fee = Math.max(fee ?? 0, f);
    const [a, b] = transit(z.state === "Lagos" ? z.eta || "1–3 working days" : deliveryQuote(z.state, price).eta);
    tmin = Math.min(tmin, a); tmax = Math.max(tmax, b);
  }
  return fee == null ? null : { fee, tmin, tmax };
}

export async function GET() {
  if (process.env.COMING_SOON === "true") return new Response("Not found", { status: 404 });
  const items: string[] = [];
  for (const summary of listProducts({ perPage: 500 }).items) {
    const p = getProduct(summary.slug);
    // Merchant Center accepts JPEG, PNG, GIF and WebP only; skip products that only have SVG artwork.
    const images = [...new Set(p?.images.filter((i) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(i)).map(abs) || [])];
    if (!p || p.noindex || !images.length) continue;
    const description = clip(plainText(p.description || p.shortDescription || p.name).replace(/\s+/g, " "), 4900);
    for (const v of p.variants) {
      const label = p.variants.length > 1 && v.label && !p.name.toLowerCase().includes(v.label.toLowerCase()) ? ` (${v.label})` : "";
      items.push(`    <item>
      <g:id>${esc(v.sku || `WX-${v.id}`)}</g:id>
      <g:item_group_id>${esc(p.slug)}</g:item_group_id>
      <g:title>${esc(clip(`WellnessXpress ${p.name}${label}`, 150))}</g:title>
      <g:description>${esc(description)}</g:description>
      <g:link>${esc(`${site.url}/product/${p.slug}`)}</g:link>
      <g:image_link>${esc(images[0])}</g:image_link>
${images.slice(1, 11).map((i) => `      <g:additional_image_link>${esc(i)}</g:additional_image_link>`).join("\n")}
      <g:availability>${inStock(v) ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${v.price.toFixed(2)} NGN</g:price>${v.salePrice != null && v.salePrice < v.price ? `\n      <g:sale_price>${effective(v).toFixed(2)} NGN</g:sale_price>` : ""}
      <g:brand>WellnessXpress</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${esc(p.type === "combo" ? "Combo sets" : "Individual products")}</g:product_type>
${(() => { const sh = nigeriaShipping(effective(v)); return sh ? `      <g:shipping><g:country>NG</g:country><g:service>Standard delivery</g:service><g:price>${sh.fee.toFixed(2)} NGN</g:price><g:min_handling_time>0</g:min_handling_time><g:max_handling_time>0</g:max_handling_time><g:min_transit_time>${sh.tmin}</g:min_transit_time><g:max_transit_time>${sh.tmax}</g:max_transit_time></g:shipping>` : ""; })()}
    </item>`.replace(/\n\n/g, "\n"));
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${esc(site.url)}</link>
    <description>${esc(site.description)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=900", "X-Robots-Tag": "noindex" } });
}
