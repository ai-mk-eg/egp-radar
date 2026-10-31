import type { NextConfig } from "next";

/** STATIC_EXPORT=1 builds the GitHub Pages version (no server; data from /data/*.json). */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = isStatic
  ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true }, poweredByHeader: false }
  : { serverExternalPackages: ["better-sqlite3", "pg"], poweredByHeader: false };
export default nextConfig;
