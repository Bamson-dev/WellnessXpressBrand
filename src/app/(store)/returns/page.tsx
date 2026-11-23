import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Returns and Refunds", description: "Our herbal products cannot be returned once opened. Report damaged, incorrect or missing items within 24 hours of delivery with your order number.", alternates: { canonical: "/returns" } };

/** Returns policy. Must match the return policy set in Google Merchant Center (no returns). */
const RETURNS_POLICY = [
  "Our products contain herbs. For safety and hygiene reasons we cannot accept returns of products that have been opened, used, unsealed or tampered with, and we do not offer a general return window.",
  "Please inspect your order when it is delivered.",
  "If an item is damaged, incorrect or missing, report it to us on WhatsApp or by email within 24 hours of delivery. Include your order number and a description of the problem, and send photographs of the item and packaging where applicable.",
  "Each claim is reviewed individually. For verified issues involving damaged, incorrect or missing products, we will decide on an appropriate resolution and tell you the next steps.",
  "Keep your order number and payment receipt until your order has been delivered and checked.",
].join("\n\n");

export default function Page() {
  return <PolicyPage title="Returns and Refunds" intro="Opened, used, unsealed or tampered-with products cannot be returned. Report damaged, incorrect or missing items within 24 hours of delivery." text={RETURNS_POLICY} />;
}
