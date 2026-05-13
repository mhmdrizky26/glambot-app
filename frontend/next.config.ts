import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Next.js 15+/16 dev-mode security: requests to /_next/* from non-localhost
  // origins are blocked unless explicitly listed. Without this, accessing the
  // dev server via LAN IP loads the HTML but blocks JS bundles → blank page.
  //
  // Add your LAN IP(s) here. Wildcard `*` is supported per-octet only at the
  // segment level (e.g. `192.168.1.*`), CIDR is NOT supported.
  allowedDevOrigins: [
    '192.168.0.*',
    '192.168.1.*',
    '192.168.2.*',
    '192.168.10.*',
    '192.168.43.*',
    '192.168.100.*',
    '10.0.0.*',
    '172.16.0.*',
    '*.local',
  ],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      // Note: photos rendered via plain <img> (not next/image), so LAN IPs
      // don't need to be listed here. Add specific hosts if you use <Image>.
      ...(isDev
        ? [
            {
              protocol: 'https' as const,
              hostname: 'picsum.photos',
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
