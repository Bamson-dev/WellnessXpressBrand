import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Returns and Refunds", description: "What to do if there is a problem with your order.", alternates: { canonical: "/returns" } };

export default function Page() {
  return <PolicyPage title="Returns and Refunds" intro="What to do if there is a problem with your order." text={getSetting<string>("returnsPolicy")} />;
}
