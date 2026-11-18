import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Shipping and Delivery", description: "How delivery works for orders placed on this website.", alternates: { canonical: "/shipping" } };

export default function Page() {
  return <PolicyPage title="Shipping and Delivery" intro="How delivery works for orders placed on this website." text={getSetting<string>("shippingPolicy")} />;
}
