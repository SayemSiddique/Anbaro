import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@stock/contracts', '@stock/design-tokens'],
};

export default nextConfig;
