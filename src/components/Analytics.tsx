import Script from "next/script";

export default function Analytics() {
  // GA_MEASUREMENT_ID is read at request time (Coolify runtime variable); NEXT_PUBLIC_GA_ID is the older build-time option.
  const raw = (process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID || "").trim();
  const ga = /^G-[A-Z0-9]{4,16}$/.test(raw) ? raw : "";
  const pl = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <>
      {ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`}</Script>
        </>
      ) : null}
      {pl ? <Script defer data-domain={pl} src="https://plausible.io/js/script.js" strategy="afterInteractive" /> : null}
    </>
  );
}
