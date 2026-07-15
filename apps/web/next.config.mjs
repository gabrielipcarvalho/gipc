import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone build → tiny production container (M1 CI/CD)
  output: "standalone",
  // monorepo: trace from repo root so the standalone bundle is complete
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // the OG-image routes read the brand font from disk via a dynamic path the tracer can't see —
  // force-include the .ttf so they exist in the standalone bundle (else OG routes 500 at runtime).
  outputFileTracingIncludes: {
    "/opengraph-image": ["./app/og/fonts/**"],
    "/**/opengraph-image": ["./app/og/fonts/**"],
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
