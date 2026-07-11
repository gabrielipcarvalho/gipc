/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone build → tiny production container (M1 CI/CD)
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
