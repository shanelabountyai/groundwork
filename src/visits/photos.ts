import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del as blobDel, get as blobGet, put as blobPut } from '@vercel/blob';

/**
 * Proof-of-service photos in Vercel Blob, private access — the bytes are
 * only reachable through the dispatcher-gated route (app/photos/[name]),
 * never by URL alone. The path goes on the visit; `PHOTO_PREFIX` plus the
 * name is the blob's pathname, same shape as the old uploads/ disk path.
 *
 * Local dev and e2e have no Blob store configured, so `defaultPhotoStore`
 * falls back to disk under uploads/ (gitignored) — the same thing this
 * module did before blob storage existed, kept as the no-token path rather
 * than requiring everyone to wire up a cloud store just to run tests.
 */
export const PHOTO_PREFIX = 'uploads';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

/** The type is read from the bytes, never from the browser's claim or the file name. */
function sniff(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  // iPhones shoot HEIC: an ISO box whose brand is one of the HEIF family.
  if (b.toString('latin1', 4, 8) === 'ftyp' && /^(heic|heix|mif1|msf1)$/.test(b.toString('latin1', 8, 12))) return 'heic';
  return null;
}

export class BadPhoto extends Error {}

/** Swap point: where photo bytes actually live. Tests inject a fake. */
export interface PhotoStore {
  put(pathname: string, bytes: Buffer, contentType: string): Promise<string>;
  get(pathname: string): Promise<ReadableStream<Uint8Array> | null>;
  remove(pathname: string): Promise<void>;
}

export const blobPhotoStore: PhotoStore = {
  async put(pathname, bytes, contentType) {
    const blob = await blobPut(pathname, bytes, { access: 'private', contentType, addRandomSuffix: false });
    return blob.pathname;
  },
  async get(pathname) {
    const result = await blobGet(pathname, { access: 'private' });
    return result?.stream ?? null;
  },
  async remove(pathname) {
    await blobDel(pathname);
  },
};

export const localPhotoStore: PhotoStore = {
  async put(pathname, bytes) {
    await mkdir(path.dirname(pathname), { recursive: true });
    await writeFile(pathname, bytes);
    return pathname;
  },
  async get(pathname) {
    try {
      return new Response(await readFile(pathname)).body;
    } catch {
      return null;
    }
  },
  async remove(pathname) {
    await rm(pathname, { force: true });
  },
};

export const defaultPhotoStore: PhotoStore = process.env.BLOB_READ_WRITE_TOKEN ? blobPhotoStore : localPhotoStore;

/** Saves one uploaded photo; an empty file input means no photo. */
export async function savePhoto(file: FormDataEntryValue | null, store: PhotoStore = defaultPhotoStore): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_PHOTO_BYTES) throw new BadPhoto('Photo is over 10 MB');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = sniff(bytes);
  const type = ext && TYPES[ext];
  if (!type) throw new BadPhoto('That file is not a photo');
  return store.put(`${PHOTO_PREFIX}/${randomUUID()}.${ext}`, bytes, type);
}
