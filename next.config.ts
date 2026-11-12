import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg"],
  // Dev only: lets the dev server be opened as http://[::1]:3000 when another app holds IPv4 port 3000.
  allowedDevOrigins: ["[::1]", "::1"],
};

export default nextConfig;
