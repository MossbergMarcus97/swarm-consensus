import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Include Prisma query engine binaries in serverless deployment
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./src/generated/prisma/**/*",
      "./node_modules/.prisma/client/**/*",
    ],
  },
  // Ensure Prisma engine files are not externalized
  serverExternalPackages: [],
};

export default nextConfig;
