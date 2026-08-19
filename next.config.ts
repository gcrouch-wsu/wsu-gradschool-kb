import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // sharp must stay external so its native bindings resolve on Vercel; do not
  // pull it into SSR page bundles (see image-variants dynamic import).
  serverExternalPackages: ["word-extractor", "mammoth", "sharp"],
  // Playwright drives the dev server via 127.0.0.1 while `next dev` reports its
  // origin as localhost, which trips Next 16's cross-origin dev-request warning.
  // Allow just that one loopback host (not a broad wildcard) to silence it.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    // Browsers probe these by default; map them to the App Router icon so deploys
    // don't log harmless 404s for missing static favicon files.
    return [
      { source: "/favicon.ico", destination: "/icon.svg" },
      { source: "/favicon.png", destination: "/icon.svg" },
    ];
  },
  async headers() {

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
