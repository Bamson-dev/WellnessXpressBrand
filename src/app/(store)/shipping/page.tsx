import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping and Delivery", description: "Delivery fees and free delivery eligibility for WellnessXpressBrand orders.", alternates: { canonical: "/shipping" } };

export default function Page() {
  return <PolicyPage title="Shipping and Delivery" intro="Enjoy complimentary delivery across all 36 states and the FCT when your discounted product subtotal reaches ₦50,000. Your delivery fee is clearly displayed at checkout." text={"Delivery is free to all 36 states and the FCT on orders of ₦50,000 and above after discounts.\n\nOrders below ₦50,000 pay the delivery fee for their selected state. The fee appears in your checkout summary and is added to the amount you transfer.\n\nWe process your order after confirming your bank transfer. Orders already placed keep the delivery charge shown when you ordered."} />;
}
