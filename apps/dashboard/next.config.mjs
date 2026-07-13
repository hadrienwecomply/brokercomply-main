import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is a dev/CI concern, not a production build step. The Next ESLint
  // plugin isn't resolved in the container build; skip lint here (type-checking
  // stays on and still fails the build on real type errors).
  eslint: { ignoreDuringBuilds: true },
  // Monorepo root (multiple lockfiles present); silences workspace-root inference.
  outputFileTracingRoot: path.join(dirname, "../.."),
  // Compile the workspace shared package from source.
  transpilePackages: ["@brokercomply/shared"],
  // Keep Node-only deps external to the bundle (used server-side only).
  serverExternalPackages: [
    "postgres",
    "openai",
    "@anthropic-ai/sdk",
    "dotenv",
    "@azure/identity",
    "@microsoft/microsoft-graph-client",
    // Website-audit deps: playwright pulls native binaries (fsevents.node) that
    // webpack can't parse, and it's loaded lazily server-side only.
    "playwright",
    "playwright-core",
    "html-to-text",
  ],
  webpack: (config, { isServer }) => {
    // Never bundle playwright: it ships a native fsevents .node binary webpack
    // can't parse. It's loaded lazily (server-side only) by the audit job.
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        "playwright",
        "playwright-core",
        "fsevents",
      ];
    }
    return config;
  },
};

export default nextConfig;
