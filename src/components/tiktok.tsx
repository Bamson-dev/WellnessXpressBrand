"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * TikTok browser Pixel. Loads only when NEXT_PUBLIC_TIKTOK_PIXEL_CODE is set (public pixel code, not the
 * Events API access token, which stays server-side). Fires PageView on route changes only.
 * Purchase is NEVER fired from the browser: it is sent server-side from the admin payment confirmation
 * action (see src/lib/capi-funnel.ts), with the same event id format TikTok uses for deduplication.
 */
const PIXEL = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_CODE || "";

type Ttq = { page?: () => void };

export function TikTokPixel() {
  const path = usePathname();
  useEffect(() => {
    if (!PIXEL) return;
    const t = (window as unknown as { ttq?: Ttq }).ttq;
    try { t?.page?.(); } catch { /* pixel not ready yet; the snippet queues its own initial page view */ }
  }, [path]);
  if (!PIXEL || !/^[A-Z0-9]{10,32}$/i.test(PIXEL)) return null;
  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["track","page","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.factory=function(t){return function(){var e=[t].concat(Array.prototype.slice.call(arguments,0));ttq.push(e)}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${PIXEL}');ttq.page();}(window,document,'ttq');`}</Script>
  );
}
