import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
