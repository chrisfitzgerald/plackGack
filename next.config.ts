import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Next.js branding
  experimental: {
    disableOptimizedLoading: true,
  },
  // Remove any default branding
  poweredByHeader: false,
  // Disable any default templates or branding
  trailingSlash: false,
  // Ensure no default components are added
  reactStrictMode: true,
};

export default nextConfig;
