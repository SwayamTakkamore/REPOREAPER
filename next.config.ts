import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Scans are ephemeral: cloned repositories live in /tmp for the duration of a
  // single request and are removed in a finally block.
  compress: true,
};

export default nextConfig;
