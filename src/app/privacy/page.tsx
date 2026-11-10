import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
export const metadata: Metadata = { title: "Privacy policy", description: "How WellnessXpressBrand collects and uses personal information.", alternates: { canonical: "/privacy" } };
export default function Page() {
  return (
    <PolicyPage title="Privacy policy">
      <p>This policy explains what information this website collects and how it is used. Last updated: [CONFIRM date].</p>
      <h2>Who we are</h2>
      <p>The website is operated by [CONFIRM legal business name and contact details].</p>
      <h2>Information we collect</h2>
      <ul>
        <li>Order requests: name, email, phone number, delivery address and order contents.</li>
        <li>Contact messages: name, email, optional phone number and your message.</li>
        <li>Newsletter: your email address.</li>
        <li>Optional analytics, if enabled: anonymous usage data about page visits.</li>
      </ul>
      <h2>How we use it</h2>
      <p>We use this information to respond to you, confirm and deliver orders, and send store news if you subscribe. We do not sell personal information.</p>
      <h2>Storage and retention</h2>
      <p>Submissions are stored on our server. [CONFIRM retention period].</p>
      <h2>Your choices</h2>
      <p>You can ask to see, correct or delete your information, or to unsubscribe, through the contact page.</p>
      <h2>Cookies and local storage</h2>
      <p>The site stores your cart in your browser so it is still there when you return. Analytics cookies are used only if analytics is enabled.</p>
    </PolicyPage>
  );
}
