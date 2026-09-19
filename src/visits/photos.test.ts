import { readFile, rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BadPhoto, savePhoto } from './photos';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

it('stores a real image under a name it chose, whatever the upload claimed', async () => {
  const saved = await savePhoto(new File([PNG], '../../etc/passwd.jpg', { type: 'image/jpeg' }));
  expect(saved).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
  expect(await readFile(saved!)).toEqual(PNG);
  await rm(saved!);
});

it('refuses a non-image dressed as one, and treats an empty input as no photo', async () => {
  await expect(savePhoto(new File(['<script>'], 'x.png', { type: 'image/png' }))).rejects.toThrow(BadPhoto);
  expect(await savePhoto(new File([], ''))).toBeUndefined();
  expect(await savePhoto(null)).toBeUndefined();
});
