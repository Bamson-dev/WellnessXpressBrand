import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping and Delivery", description: "Delivery fees and free delivery eligibility for WellnessXpressBrand orders.", alternates: { canonical: "/shipping" } };

export default function Page() {
  return <PolicyPage title="Shipping and Delivery" intro="Enjoy FREE DELIVERY across all 36 states and the FCT when your discounted product subtotal reaches ₦50,000. Your delivery fee is clearly displayed at checkout." text={"We offer FREE DELIVERY across all 36 states and the FCT when your discounted product subtotal reaches ₦50,000.\n\nFor orders that do not reach the free-delivery threshold, the applicable state delivery fee will appear in your checkout summary before you place your order.\n\nWe process your order after confirming your bank transfer. Orders already placed keep the delivery charge shown when you ordered."} />;
}
