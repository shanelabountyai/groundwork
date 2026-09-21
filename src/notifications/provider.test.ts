import { describe, expect, it } from 'vitest';
import { defaultProvider } from './provider';

describe('defaultProvider', () => {
  it('falls back to logging when no Twilio/Resend env vars are set', async () => {
    await expect(
      defaultProvider.send({ id: '1', visitId: 'v1', channel: 'sms', to: '555-0100', body: 'test', createdAt: new Date(), sentAt: null }),
    ).resolves.toBeUndefined();
    await expect(
      defaultProvider.send({ id: '2', visitId: 'v1', channel: 'email', to: 'a@b.com', body: 'test', createdAt: new Date(), sentAt: null }),
    ).resolves.toBeUndefined();
  });
});
