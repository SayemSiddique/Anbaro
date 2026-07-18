import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@anbaro/contracts', '@anbaro/design-tokens'],
};

export default nextConfig;
