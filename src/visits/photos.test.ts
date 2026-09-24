import { expect, it } from 'vitest';
import { BadPhoto, savePhoto, type PhotoStore } from './photos';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function fakeStore() {
  const saved: { pathname: string; bytes: Buffer; contentType: string }[] = [];
  const store: PhotoStore = {
    async put(pathname, bytes, contentType) {
      saved.push({ pathname, bytes, contentType });
      return pathname;
    },
    async get() {
      throw new Error('not exercised by this test');
    },
    async remove() {},
  };
  return { store, saved };
}

it('stores a real image under a name it chose, whatever the upload claimed', async () => {
  const { store, saved } = fakeStore();
  const pathname = await savePhoto(new File([PNG], '../../etc/passwd.jpg', { type: 'image/jpeg' }), store);
  expect(pathname).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
  expect(saved).toEqual([{ pathname, bytes: PNG, contentType: 'image/png' }]);
});

it('refuses a non-image dressed as one, and treats an empty input as no photo', async () => {
  const { store } = fakeStore();
  await expect(savePhoto(new File(['<script>'], 'x.png', { type: 'image/png' }), store)).rejects.toThrow(BadPhoto);
  expect(await savePhoto(new File([], ''), store)).toBeUndefined();
  expect(await savePhoto(null, store)).toBeUndefined();
});
