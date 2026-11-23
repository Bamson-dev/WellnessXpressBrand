import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Returns and Refunds", description: "Request a return within 5 days of receiving your WellnessXpressBrand order. How to contact us and what to include.", alternates: { canonical: "/returns" } };

/** Returns policy. The 5-day window here must match the return policy set in Google Merchant Center. */
const RETURNS_POLICY = [
  "You can request a return within 5 days of receiving your order.",
  "To request a return, message us on WhatsApp or email us within 5 days of delivery. Include your order number, the product you want to return and a short description of the reason or problem. If a product arrived damaged or is not what you ordered, send a photo.",
  "Every return request is reviewed. Returns are subject to review and to the product being eligible for return. We will reply to tell you whether your request is accepted and what the next steps are.",
  "If there is any other problem with your order, contact us the same way with your order number and we will help.",
  "Keep your order number and payment receipt until your order has been delivered and the 5-day return window has passed.",
].join("\n\n");

export default function Page() {
  return <PolicyPage title="Returns and Refunds" intro="You can request a return within 5 days of receiving your order." text={RETURNS_POLICY} />;
}
