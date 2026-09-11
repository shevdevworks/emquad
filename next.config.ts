import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development only: the dev server rejects cross-origin requests for
  // /_next assets, so opening the site from a phone on the same Wi-Fi
  // returned 403 for every chunk and the page never hydrated.
  allowedDevOrigins: ['192.168.1.*'],
};

export default nextConfig;
