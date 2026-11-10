import Script from "next/script";

export default function Analytics() {
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  const pl = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <>
      {ga ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga.replace(/[^A-Za-z0-9-]/g, "")}');`}</Script>
        </>
      ) : null}
      {pl ? <Script defer data-domain={pl} src="https://plausible.io/js/script.js" strategy="afterInteractive" /> : null}
    </>
  );
}
