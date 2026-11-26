import type { Metadata } from "next";
import OrderFunnelForm from "@/components/OrderFunnelForm";
import { FUNNEL } from "@/lib/funnel";
import { naira } from "@/lib/site";

export const metadata: Metadata = {
  title: "Order your 3-in-1 Combo",
  description: "Place your WellnessX General Fat Loss 3-in-1 Combo order. You get payment instructions straight after.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/order-3in1" },
};

export default function Order3in1() {
  return (
    <div className="container-x mx-auto max-w-xl py-8 sm:py-12">
      <h1 className="text-3xl sm:text-4xl">Order your 3-in-1 Combo</h1>
      <div className="card mt-4 p-4 text-[15px]">
        <p className="font-semibold">{FUNNEL.name}</p>
        <p className="text-neutral-600">{FUNNEL.label}</p>
        <p className="mt-2 text-lg"><strong>{naira(FUNNEL.price)}</strong> <span className="text-neutral-500 line-through">{naira(FUNNEL.regular)}</span> <span className="font-semibold text-brand-700">Save {naira(FUNNEL.regular - FUNNEL.price)}</span></p>
        <p className="mt-1 text-neutral-700">Free digital weighing scale and free nationwide delivery when you order now.</p>
      </div>
      <p className="mt-4 text-neutral-700">Fill in your details to place your order. You do not pay on this page. You get our bank details and your order number straight after you submit.</p>
      <div className="mt-5"><OrderFunnelForm /></div>
    </div>
  );
}
