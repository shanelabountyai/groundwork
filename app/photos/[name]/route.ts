import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { currentRole } from '@/src/session';
import { UPLOAD_DIR } from '@/src/visits/photos';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

/**
 * Proof-of-service photos off local disk, for the dispatcher only — crews shot
 * them, the office reviews them. The name must be exactly what savePhoto
 * writes (a uuid and a sniffed extension), so nothing can walk out of uploads/.
 */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  if ((await currentRole())?.kind !== 'dispatcher') return new Response('Not yours', { status: 403 });
  const { name } = await params;
  const ext = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(name)?.[1];
  if (!ext || !TYPES[ext]) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(UPLOAD_DIR, name));
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': TYPES[ext], 'cache-control': 'private, max-age=3600' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
