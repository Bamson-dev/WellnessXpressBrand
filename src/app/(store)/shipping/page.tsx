import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping and Delivery", description: "Delivery fees and free delivery eligibility for WellnessXpressBrand orders.", alternates: { canonical: "/shipping" } };

export default function Page() {
  return <PolicyPage title="Shipping and Delivery" intro="Free delivery when your product subtotal after discounts reaches ₦50,000. Your delivery fee is shown at checkout." text={"Delivery is free to all 36 states when your product subtotal after discounts reaches ₦50,000. Delivery to Abuja (FCT) is always ₦5,000.\n\nBelow ₦50,000, the delivery fee for your state appears in your checkout summary before you place your order. In Lagos, the fee depends on the area you choose.\n\nYou pay one total, products and delivery, to WellnessXpressBrand. We pay the delivery agent.\n\nWe process your order after confirming your bank transfer. Orders already placed keep the delivery charge shown when you ordered."} />;
}
