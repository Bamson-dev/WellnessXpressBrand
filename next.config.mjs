const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data: blob: https://www.facebook.com https://*.google-analytics.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://*.googletagmanager.com https://plausible.io https://connect.facebook.net https://static.cloudflareinsights.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://plausible.io https://www.facebook.com https://connect.facebook.net https://cloudflareinsights.com https://static.cloudflareinsights.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://wa.me",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Guides are Markdown files read at request time; copy them into the standalone server bundle.
  outputFileTracingIncludes: { "/**": ["./content/guides/**"] },
  poweredByHeader: false,
  // Version-skew protection: browsers can detect a deployment change and reload instead
  // of submitting stale Server Action identifiers to a different build.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  generateBuildId: async () => process.env.NEXT_DEPLOYMENT_ID || `build-${Date.now()}`,
  // Put page metadata in <head> for every visitor (Next 15 otherwise streams it later for non-bot browsers).
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  compress: true,
  images: { formats: ["image/webp"] },
  experimental: { serverActions: { bodySizeLimit: "8mb", allowedOrigins: ["wellnessxpressbrand.com", "www.wellnessxpressbrand.com"] } },
  // Public file-style URLs served by route handlers (folder names avoid dots so they stay easy to edit on GitHub).
  async rewrites() {
    return [
      { source: "/feeds/google-merchant.xml", destination: "/feeds/google-merchant" },
      { source: "/llms.txt", destination: "/llms-txt" },
    ];
  },
  async headers() {
    const deploymentHeader = process.env.NEXT_DEPLOYMENT_ID
      ? [{ key: "x-nextjs-deployment-id", value: process.env.NEXT_DEPLOYMENT_ID }]
      : [];
    return [{ source: "/:path*", headers: [...securityHeaders, ...deploymentHeader] }];
  },
};
export default nextConfig;
