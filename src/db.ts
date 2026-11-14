import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { env } from './env';

// Validated (and required) by the env schema.
const connectionString = env.DATABASE_URL;

// Same guard as prisma.config.ts: reaching a cloud database has to be typed.
if (!env.GROUNDWORK_ALLOW_CLOUD_DB && /neon\.tech|rds\.amazonaws|supabase\.co/.test(connectionString)) {
  throw new Error('Groundwork runs on local Postgres. Refusing a cloud database.');
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
