// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  serverExternalPackages: ["node-pty", "simple-git", "better-sqlite3"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "**.githubusercontent.com",
      },
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      ".next/dev/**/*",
      ".next/cache/**/*",
      ".git/**/*",
      ".github/**/*",
      ".claude/**/*",
      ".agents/**/*",
      "coverage/**/*",
      "out/**/*",
      "test/**/*",
      "**/.DS_Store",
    ],
  },
};

export default nextConfig;