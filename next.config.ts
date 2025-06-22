import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    DATABASE_URL: "mongodb+srv://plackAdmin:8YRuhJeFIQcdFAoA@cluster0.mts49v9.mongodb.net/plackgack?retryWrites=true&w=majority&appName=Cluster0",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "2f66a264cba8b90cac804b018dc1a9b4",
    GOOGLE_CLIENT_ID: "66872105422-pf4lh8vhnj7bduk9hhnlvdm5eh9k1hi2.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "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",
  },
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
