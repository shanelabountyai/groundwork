import { describe, expect, it } from 'vitest';
import { isAuthorizedCron } from './cron';

const req = (authorization?: string) => new Request('http://localhost/api/cron/outbox', { headers: authorization ? { authorization } : {} });

describe('isAuthorizedCron', () => {
  it('accepts the exact bearer', () => {
    expect(isAuthorizedCron(req('Bearer s3cret-value'), 's3cret-value')).toBe(true);
  });

  it('refuses a wrong, truncated, extended or missing bearer', () => {
    expect(isAuthorizedCron(req('Bearer s3cret-valuX'), 's3cret-value')).toBe(false);
    expect(isAuthorizedCron(req('Bearer s3cret'), 's3cret-value')).toBe(false);
    expect(isAuthorizedCron(req('Bearer s3cret-value-and-more'), 's3cret-value')).toBe(false);
    expect(isAuthorizedCron(req('s3cret-value'), 's3cret-value')).toBe(false);
    expect(isAuthorizedCron(req(), 's3cret-value')).toBe(false);
  });

  it('fails closed when the secret is unset or empty', () => {
    expect(isAuthorizedCron(req('Bearer '), '')).toBe(false);
    expect(isAuthorizedCron(req('Bearer undefined'), undefined)).toBe(false);
    expect(isAuthorizedCron(req(), undefined)).toBe(false);
  });
});
