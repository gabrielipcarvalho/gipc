import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone build → tiny production container (M1 CI/CD)
  output: "standalone",
  // monorepo: trace from repo root so the standalone bundle is complete
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
