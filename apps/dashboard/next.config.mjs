import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  ],
};

export default nextConfig;
