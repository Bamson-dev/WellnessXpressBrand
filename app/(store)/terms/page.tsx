import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Terms and Conditions", description: "The terms that apply when you order from this website.", alternates: { canonical: "/terms" } };

export default function Page() {
  return <PolicyPage title="Terms and Conditions" intro="The terms that apply when you order from this website." text={getSetting<string>("termsPolicy")} />;
}
