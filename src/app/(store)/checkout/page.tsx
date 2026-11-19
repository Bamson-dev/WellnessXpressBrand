import type { Metadata } from "next";
import CheckoutForm from "@/components/CheckoutForm";
import { NIGERIAN_STATES } from "@/lib/site";
import { deliveryZones } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function Checkout() {
  // Only states with delivery coverage switched on can be chosen. Delivery is free to all of them.
  const covered = new Set(deliveryZones().filter((z) => z.active).map((z) => z.state));
  return <CheckoutForm states={NIGERIAN_STATES.filter((s) => covered.has(s))} />;
}
