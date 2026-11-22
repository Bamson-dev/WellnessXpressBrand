"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("WellnessX global application error:", error);
  }, [error]);

  return (
    <html lang="en-NG">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "#f8faf8", color: "#171717", fontFamily: "Arial, sans-serif" }}>
          <section style={{ width: "100%", maxWidth: "520px", border: "1px solid #e5e7eb", borderRadius: "18px", padding: "32px", background: "#fff" }}>
            <p style={{ color: "#166534", fontWeight: 700 }}>WellnessXpressBrand</p>
            <h1 style={{ fontSize: "26px", marginTop: "12px" }}>The page could not load</h1>
            <p style={{ color: "#525252", lineHeight: 1.6, marginTop: "12px" }}>A system error interrupted the page. Try again or return to the homepage.</p>
            {error.digest ? <p style={{ color: "#737373", fontSize: "12px", marginTop: "12px" }}>Error reference: {error.digest}</p> : null}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
              <button onClick={() => reset()} style={{ background: "#166534", color: "white", border: 0, borderRadius: "8px", padding: "12px 18px", fontWeight: 700 }}>Try again</button>
              <a href="/" style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "12px 18px", fontWeight: 700, color: "#171717", textDecoration: "none" }}>Homepage</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
