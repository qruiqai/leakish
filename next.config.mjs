/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is required by our Docker runtime stage (server.js).
  output: 'standalone',
  reactStrictMode: true,
  eslint: {
    // Lint runs in CI separately; speed up Docker builds.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
