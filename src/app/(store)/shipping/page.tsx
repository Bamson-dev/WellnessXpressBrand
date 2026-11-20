import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping and Delivery", description: "Delivery fees and free delivery eligibility for WellnessXpressBrand orders.", alternates: { canonical: "/shipping" } };

export default function Page() {
  return <PolicyPage title="Shipping and Delivery" intro="Free delivery on orders with a discounted product subtotal of ₦50,000 or more. Orders below ₦50,000 pay the delivery fee for their selected state. We show the fee and final total at checkout." text={"Delivery is free to all 36 states and the FCT on orders of ₦50,000 and above after discounts.\n\nOrders below ₦50,000 pay the delivery fee for their selected state. The fee appears in your checkout summary and is added to the amount you transfer.\n\nWe process your order after confirming your bank transfer. Orders already placed keep the delivery charge shown when you ordered."} />;
}
