import type { NextConfig } from "next";
import "./lib/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"],
  allowedDevOrigins: ['192.168.1.5',"jh5lsv74-3000.inc1.devtunnels.ms",],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "jh5lsv74-3000.inc1.devtunnels.ms",
      ],
    },
  },
};

export default nextConfig;
