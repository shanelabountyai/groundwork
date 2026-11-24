import { connection } from 'next/server';
import { isAuthorizedCron } from '@/src/cron';
import { drainOutbox } from '@/src/notifications/drain';

/**
 * Vercel Cron (vercel.json) sends `Authorization: Bearer $CRON_SECRET`. With no
 * secret configured the route refuses, so an open deploy never lets the public
 * trigger sends. The compare is constant-time (src/cron.ts).
 */
export async function GET(req: Request) {
  await connection();
  if (!isAuthorizedCron(req)) return new Response('Unauthorized', { status: 401 });
  return Response.json({ sent: await drainOutbox() });
}
