import type { Metadata } from "next";
import CheckoutForm from "@/components/CheckoutForm";
import { NIGERIAN_STATES } from "@/lib/site";
import { deliveryZones } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function Checkout() {
  const zones = deliveryZones().filter((z) => z.active && z.fee != null).map((z) => z.state);
  return <CheckoutForm states={NIGERIAN_STATES} statesWithFee={zones} />;
}
