/** Money is integer cents everywhere; this is the only place it becomes a string. */
export const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** A dollars-and-cents form field ("42.50") to integer cents, or null if it isn't one. */
export function parseCents(input: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) return null;
  return Math.round(Number(input.trim()) * 100);
}
