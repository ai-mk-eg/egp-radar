import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pg"],
  poweredByHeader: false,
};
export default nextConfig;
