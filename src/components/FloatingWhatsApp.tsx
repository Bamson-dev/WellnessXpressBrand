"use client";
import { usePathname } from "next/navigation";
import { IconWhatsApp } from "@/components/icons";

export default function FloatingWhatsApp({ whatsapp }: { whatsapp: string }) {
  const path = usePathname();
  if (!whatsapp || path.startsWith("/checkout") || path.startsWith("/order/")) return null;
  return (
    <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I need help with my order.")}`} target="_blank" rel="noopener noreferrer"
      className="fixed bottom-4 right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-[#1FA855] px-4 text-white shadow-lg transition hover:bg-[#178a45] sm:bottom-6 sm:right-6"
      aria-label="Chat with us on WhatsApp">
      <IconWhatsApp className="h-6 w-6" />
      <span className="hidden text-[15px] font-semibold sm:inline">Need help?</span>
    </a>
  );
}
