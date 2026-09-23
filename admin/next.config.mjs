import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Baseline security headers.
 *
 * The admin console loads no third-party scripts, fonts, styles, images, or
 * frames — everything is same-origin except API calls to the backend. These
 * headers lock that down and keep the console out of frames.
 *
 * CSP is shipped in report-only mode first because Next.js injects inline
 * bootstrap scripts/styles; move to enforcing `Content-Security-Policy` once a
 * nonce-based policy has been verified against a production build.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https:",
      "object-src 'none'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // Traces only the dependencies actually reachable from the built app into
  // .next/standalone, instead of shipping the full ~300-400MB node_modules
  // in the deployed image. Railway's Railpack builder detects this and
  // copies public/ + .next/static into the standalone output for you —
  // this is what actually shrinks the image (and therefore the Docker
  // export / upload step), not the npm-install-time tweaks alone.
  output: 'standalone',
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // No webpack()/turbopack config needed: the `@/*` alias every import in
  // this app uses is already resolved from tsconfig.json's `paths` — both
  // Next's webpack and Turbopack builds pick that up natively. A custom
  // `webpack(config)` block that only duplicated this alias used to force
  // `next build` onto the slower webpack bundler (Turbopack refuses to run
  // silently past an unmigrated webpack config); removing it lets `next
  // build` use Turbopack, which is the default in Next.js 16.
};

export default nextConfig;
