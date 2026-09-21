import { describe, expect, it } from 'vitest';
import { defaultProvider } from './provider';

describe('defaultProvider', () => {
  it('falls back to logging when no Twilio/Resend env vars are set', async () => {
    await expect(
      defaultProvider.send({ channel: 'sms', to: '555-0100', body: 'test' }),
    ).resolves.toBeUndefined();
    await expect(
      defaultProvider.send({ channel: 'email', to: 'a@b.com', body: 'test' }),
    ).resolves.toBeUndefined();
  });
});
