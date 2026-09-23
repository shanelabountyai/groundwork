import { currentPropertyId } from '@/src/portal/session';
import { propertyOwnsPhoto } from '@/src/portal/view';
import { defaultPhotoStore, PHOTO_PREFIX, TYPES } from '@/src/visits/photos';

/**
 * A customer's own proof-of-service photos. Separate from the dispatcher route
 * on purpose (app/photos/[name]): the check here is "this photo sits on a visit
 * at the signed-in property", and one 404 covers not-yours and not-found so a
 * name can't be probed for existence.
 */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const propertyId = await currentPropertyId();
  if (!propertyId) return new Response('Sign in', { status: 401 });
  const { name } = await params;
  const ext = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(name)?.[1];
  const type = ext && TYPES[ext];
  if (!type || !(await propertyOwnsPhoto(propertyId, name))) return new Response('Not found', { status: 404 });
  const stream = await defaultPhotoStore.get(`${PHOTO_PREFIX}/${name}`);
  if (!stream) return new Response('Not found', { status: 404 });
  return new Response(stream, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
}
