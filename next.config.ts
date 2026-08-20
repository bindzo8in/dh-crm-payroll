import type { NextConfig } from "next";
import "./lib/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"],
  allowedDevOrigins: ["rented-commodity-uncoated.ngrok-free.dev"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'rented-commodity-uncoated.ngrok-free.dev',
        '275vkjpg-3000.inc1.devtunnels.ms', // Your specific dev tunnel host
        '*.devtunnels.ms',                  // Wildcard matching for dev tunnels
        'localhost:3000',
      ],
    },
  },
};

export default nextConfig;
