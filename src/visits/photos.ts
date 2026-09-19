import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Proof-of-service photos on the local filesystem (PRD: filesystem paths in
 * v1). The path goes on the visit; the bytes go under uploads/.
 * ponytail: local disk, so it does not survive a serverless deploy; swap in
 * blob storage behind savePhoto when the app is hosted.
 */
export const UPLOAD_DIR = 'uploads';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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

/** Saves one uploaded photo; an empty file input means no photo. */
export async function savePhoto(file: FormDataEntryValue | null): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_PHOTO_BYTES) throw new BadPhoto('Photo is over 10 MB');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) throw new BadPhoto('That file is not a photo');
  await mkdir(UPLOAD_DIR, { recursive: true });
  const rel = path.posix.join(UPLOAD_DIR, `${randomUUID()}.${ext}`);
  await writeFile(rel, bytes);
  return rel;
}
