import type { NextConfig } from "next";

// Dynamic, per-responder data only: no prerendering or component caching.
const nextConfig: NextConfig = {
  // Dev server only: allow loading dev scripts when opened as 127.0.0.1 (or a LAN IP set here).
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DASHBOARD_DEV_ORIGINS?.split(",").filter(Boolean) ?? [])],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
