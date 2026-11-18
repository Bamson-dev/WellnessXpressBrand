"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/* Store Pixel. Loads only when NEXT_PUBLIC_META_PIXEL_ID is set. Separate from the funnel landing-page pixels. */
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
type Fbq = (...a: unknown[]) => void;

export function newEventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
export function track(event: string, data: Record<string, unknown> = {}, eventId?: string) {
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  if (!PIXEL || typeof f !== "function") return;
  f("track", event, data, { eventID: eventId || newEventId(event.slice(0, 2).toLowerCase()) });
}

export function StorePixel() {
  const path = usePathname();
  useEffect(() => {
    if (PIXEL) track("PageView");
  }, [path]);
  if (!PIXEL || !/^\d{6,20}$/.test(PIXEL)) return null;
  return (
    <Script id="store-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');`}</Script>
  );
}

export function TrackView({ event, data }: { event: string; data: Record<string, unknown> }) {
  useEffect(() => {
    const t = setTimeout(() => track(event, data), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
