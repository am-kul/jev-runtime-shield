import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: [
    path.resolve(import.meta.dirname, "../../.env.local"),
    path.resolve(import.meta.dirname, "../../.env"),
  ],
  quiet: true,
});

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  devIndicators: false,
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  poweredByHeader: false,
};
export default config;
