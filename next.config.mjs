const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data: blob: https://www.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://plausible.io https://connect.facebook.net https://static.cloudflareinsights.com; connect-src 'self' https://www.google-analytics.com https://plausible.io https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://cloudflareinsights.com https://static.cloudflareinsights.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://wa.me",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Version-skew protection: browsers can detect a deployment change and reload instead
  // of submitting stale Server Action identifiers to a different build.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.GIT_COMMIT_SHA || process.env.CI_COMMIT_SHA || "wellnessx-build",
  // Put page metadata in <head> for every visitor (Next 15 otherwise streams it later for non-bot browsers).
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  compress: true,
  images: { formats: ["image/webp"] },
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
