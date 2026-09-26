import { savePhoto } from '@/src/visits/photos';
import { applyStop } from '../stop';

/**
 * SEC-05: completing a stop carries two phone photos, so it is the one POST
 * allowed a large body. It lives here, not in a server action, because the
 * action body limit is global and would cover the anonymous sign-in forms too.
 */
// Two photos at 10 MB each (enforced in savePhoto) plus multipart overhead.
const MAX_BODY = 21 * 1024 * 1024;

export async function POST(req: Request) {
  // Checked before the body is read; a browser form post always sends a length.
  const length = Number(req.headers.get('content-length'));
  if (!length || length > MAX_BODY) return new Response('Request too large', { status: 413 });
  // Server actions get a CSRF check from Next; a route handler has to do its own.
  // SameSite=lax alone lets a sibling subdomain post here with the crew's cookie.
  // Sec-Fetch-Site, not Origin: our no-referrer policy makes a form post's Origin "null".
  if (req.headers.get('sec-fetch-site') !== 'same-origin') return new Response('Forbidden', { status: 403 });

  const form = await req.formData();
  const to = await applyStop(form, async (saved) => {
    const beforePhoto = await savePhoto(form.get('before'));
    if (beforePhoto) saved.push(beforePhoto);
    const afterPhoto = await savePhoto(form.get('after'));
    if (afterPhoto) saved.push(afterPhoto);
    const note = form.get('note');
    return { to: 'completed', note: typeof note === 'string' ? note : undefined, beforePhoto, afterPhoto };
  });
  // 303 so the browser follows with a GET.
  return Response.redirect(new URL(to, req.url), 303);
}
