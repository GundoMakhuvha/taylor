/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // Hide the Next.js development badge (the "N" in the corner).
  devIndicators: false,
  // No source maps in production, so the shipped code stays opaque.
  productionBrowserSourceMaps: false,
  // Ship the fonts + logo used to render social images with the serverless function.
  outputFileTracingIncludes: {
    "/api/social/image/[file]": ["./assets/**/*"],
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
