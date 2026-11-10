import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
export const metadata: Metadata = { title: "Terms and conditions", description: "Terms for using WellnessXpressBrand and placing orders.", alternates: { canonical: "/terms" } };
export default function Page() {
  return (
    <PolicyPage title="Terms and conditions">
      <h2>Using this website</h2>
      <p>By using this website you agree to these terms. Product information is general and is not medical advice.</p>
      <h2>Orders</h2>
      <p>Submitting checkout sends an order request. An order is confirmed only after the team confirms availability, price, delivery and payment with you. Online payment is not currently enabled.</p>
      <h2>Prices and availability</h2>
      <p>Prices are shown in Nigerian naira. We may correct errors in prices or availability before confirming an order. [CONFIRM whether prices include VAT].</p>
      <h2>Payment</h2>
      <p>[CONFIRM accepted payment methods and timing].</p>
      <h2>Delivery, returns and refunds</h2>
      <p>See the Shipping and delivery policy and the Returns and refunds policy.</p>
      <h2>Liability</h2>
      <p>[CONFIRM limitation of liability wording with a legal adviser].</p>
      <h2>Governing law</h2>
      <p>[CONFIRM governing law and jurisdiction].</p>
    </PolicyPage>
  );
}
