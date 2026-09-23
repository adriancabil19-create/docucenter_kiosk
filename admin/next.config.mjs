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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // No webpack()/turbopack config needed: the `@/*` alias every import in
  // this app uses is already resolved from tsconfig.json's `paths` — both
  // bundlers pick that up natively. This used to duplicate that alias in a
  // `webpack(config)` block for no reason.
  //
  // The build script still forces `next build --webpack` (see
  // package.json) — Turbopack was tried and hits a real
  // `createContext is not a function` crash from @heroui/react +
  // framer-motion, not a config issue. Don't re-attempt without confirming
  // that's fixed upstream first.
  //
  // `output: 'standalone'` was also tried (2026-09-24) to shrink the
  // Railway deploy image, but the deployed container failed its healthcheck
  // (crashed or never bound to the port — never got runtime logs to
  // confirm which). Reverted. Retry only with Railway's actual deploy/
  // runtime logs in hand, not just a local test — a local `node
  // .next/standalone/server.js` run served pages fine, so whatever broke it
  // was Railway-environment-specific.
};

export default nextConfig;
