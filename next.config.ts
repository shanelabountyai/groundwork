import type { NextConfig } from 'next';

const config: NextConfig = {
  // The generated Prisma client and the pg driver stay on the server.
  serverExternalPackages: ['@prisma/client', 'pg'],
  typedRoutes: false,
  // Two phone photos (10 MB each, enforced in savePhoto) plus multipart overhead.
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
};

export default config;
