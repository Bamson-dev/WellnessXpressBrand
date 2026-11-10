import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
export const metadata: Metadata = { title: "Shipping and delivery", description: "Delivery areas, fees and timelines for WellnessXpressBrand orders.", alternates: { canonical: "/shipping" } };
export default function Page() {
  return (
    <PolicyPage title="Shipping and delivery">
      <h2>Delivery areas</h2>
      <p>[CONFIRM states and cities served].</p>
      <h2>Delivery fees</h2>
      <p>[CONFIRM fee structure]. Delivery cost is confirmed with you before you pay.</p>
      <h2>Delivery times</h2>
      <p>[CONFIRM estimated delivery times per area]. Times are estimates, not guarantees.</p>
      <h2>Order tracking and problems</h2>
      <p>Contact us with your order reference if your order is late or arrives damaged. [CONFIRM tracking arrangements].</p>
    </PolicyPage>
  );
}
