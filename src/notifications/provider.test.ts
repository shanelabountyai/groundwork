import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('throws in production rather than dropping a message when a channel is unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(defaultProvider.send({ channel: 'sms', to: '555-0100', body: 'x' })).rejects.toThrow(/sms/);
  });

  it('logs the body only in development', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'test');
    await defaultProvider.send({ channel: 'email', to: 'a@b.com', body: 'secret-link' });
    vi.stubEnv('NODE_ENV', 'development');
    await defaultProvider.send({ channel: 'email', to: 'a@b.com', body: 'secret-link' });
    expect(log.mock.calls[0]![0]).not.toContain('secret-link');
    expect(log.mock.calls[1]![0]).toContain('secret-link');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
});
