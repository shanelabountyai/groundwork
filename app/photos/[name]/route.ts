import { currentRole } from '@/src/session';
import { defaultPhotoStore, PHOTO_PREFIX, TYPES } from '@/src/visits/photos';

/**
 * Proof-of-service photos out of blob storage, for the dispatcher only —
 * crews shot them, the office reviews them. The name must be exactly what
 * savePhoto writes (a uuid and a sniffed extension), so nothing can request
 * a pathname outside its own prefix.
 */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  if ((await currentRole())?.kind !== 'dispatcher') return new Response('Not yours', { status: 403 });
  const { name } = await params;
  const ext = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(name)?.[1];
  const type = ext && TYPES[ext];
  if (!type) return new Response('Not found', { status: 404 });
  const stream = await defaultPhotoStore.get(`${PHOTO_PREFIX}/${name}`);
  if (!stream) return new Response('Not found', { status: 404 });
  return new Response(stream, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
}
