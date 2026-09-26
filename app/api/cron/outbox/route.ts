import { connection } from 'next/server';
import { drainOutbox } from '@/src/notifications/drain';

/**
 * Vercel Cron (vercel.json) sends `Authorization: Bearer $CRON_SECRET`. With no
 * secret configured the route refuses, so an open deploy never lets the public
 * trigger sends.
 */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json({ sent: await drainOutbox() });
}
