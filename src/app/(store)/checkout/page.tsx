import type { Metadata } from "next";
import CheckoutForm from "@/components/CheckoutForm";
import { NIGERIAN_STATES } from "@/lib/site";
import { deliveryZones } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function Checkout() {
  const deliveryQuotes = Object.fromEntries(deliveryZones().map((z) => [z.state, { fee: z.fee, active: z.active, estimatedDelivery: z.estimatedDelivery }]));
  return <CheckoutForm states={NIGERIAN_STATES} deliveryQuotes={deliveryQuotes} />;
}
