import { describe, expect, it } from 'vitest';
import { parseCents } from './money';

describe('parseCents', () => {
  it('parses dollars-and-cents form input to integer cents', () => {
    expect(parseCents('45')).toBe(4500);
    expect(parseCents('45.5')).toBe(4550);
    expect(parseCents('45.50')).toBe(4550);
  });

  it('rejects anything that is not a plain non-negative dollar amount', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('-5')).toBeNull();
    expect(parseCents('5.999')).toBeNull();
    expect(parseCents('abc')).toBeNull();
  });
});
