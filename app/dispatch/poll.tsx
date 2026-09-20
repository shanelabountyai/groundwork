'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-renders the server page every few seconds while it is on screen, so the
 * board reflects skips and reschedules without a manual refresh (P0-7). Holds
 * no data of its own. ponytail: refreshes blind; add a change cursor (as
 * Countertop does) if the board query ever gets expensive.
 */
export function Poll({ ms = 10_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (!document.hidden) router.refresh(); };
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [ms, router]);
  return null;
}
