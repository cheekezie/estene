import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@estene/contracts', '@estene/lib', '@estene/ui'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
