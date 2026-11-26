import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Privacy Policy", description: "What we collect when you order, and how we use it.", alternates: { canonical: "/privacy" } };

export default function Page() {
  return <PolicyPage title="Privacy Policy" intro="What we collect when you order, and how we use it." text={getSetting<string>("privacyPolicy")} />;
}
