import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
export const metadata: Metadata = { title: "Returns and refunds", description: "Returns and refund policy for WellnessXpressBrand orders.", alternates: { canonical: "/returns" } };
export default function Page() {
  return (
    <PolicyPage title="Returns and refunds">
      <h2>Return window</h2>
      <p>[CONFIRM number of days and conditions].</p>
      <h2>Items we cannot take back</h2>
      <p>[CONFIRM, for example opened consumable products for hygiene reasons].</p>
      <h2>Damaged or wrong items</h2>
      <p>Contact us with your order reference and photos as soon as you receive the item. [CONFIRM remedy: replacement or refund].</p>
      <h2>Refunds</h2>
      <p>[CONFIRM refund method and timeline].</p>
    </PolicyPage>
  );
}
