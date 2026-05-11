import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: isDev
      ? [
          {
            // Development only — mock photo URLs from picsum.photos
            protocol: 'https',
            hostname: 'picsum.photos',
          },
        ]
      : [],
  },
};

export default nextConfig;
