import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // PGlite ships wasm + data files; keep it (and pg/pino, the CJS Nexconn server SDK) out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pino", "@nexconn/server-sdk"],
  poweredByHeader: false,
  // Lets a second build (e.g. Lighthouse runs) live beside the e2e build. Default stays .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        // CSS Modules must keep Next's own scoping; only global stylesheets go through Tailwind.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
