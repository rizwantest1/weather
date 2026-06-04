import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow remote PDF/image domains used by BMD (servers rotate: server6/server8 etc.)
  async headers() {
    return [
      {
        // Never cache the API responses so the freshest forecast is always fetched.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
