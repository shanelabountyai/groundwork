/** Runs once when a server instance starts: refuse to serve on a malformed environment (src/env.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./src/env');
}
