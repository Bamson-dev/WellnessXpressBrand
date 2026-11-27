import type { Metadata } from "next";
import ConfirmPaymentDetailsForm from "@/components/ConfirmPaymentDetailsForm";

export const metadata: Metadata = {
  title: "Confirm Payment & Delivery Details",
  description: "For customers who have already paid. Send your delivery details and payment receipt.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/confirm-payment" },
};

export default function ConfirmPaymentPage() {
  return (
    <div className="container-x mx-auto max-w-xl py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl">CONFIRM YOUR PAYMENT</h1>
      <p className="mt-3 text-lg text-neutral-700">Thank you for your payment.</p>
      <p className="mt-2 text-neutral-700">Please complete this short form so we can confirm your payment and process your order for delivery.</p>
      <p className="mt-2 font-semibold text-neutral-900">This form is strictly for customers who have already made payment.</p>
      <p className="mt-2 text-neutral-700">You will need your <strong>order number</strong> — it is shown on your order page. If you paid after chatting with us on WhatsApp and do not have an order number, send your receipt to us on WhatsApp instead and we will match it for you.</p>
      <div className="mt-6"><ConfirmPaymentDetailsForm /></div>
    </div>
  );
}
