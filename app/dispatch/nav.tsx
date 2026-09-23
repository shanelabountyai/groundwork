'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/dispatch/reschedules', label: 'Reschedules' },
  { href: '/dispatch/properties', label: 'Properties' },
  { href: '/dispatch/invoices', label: 'Invoices' },
  { href: '/dispatch/report', label: 'Reports' },
  { href: '/dispatch/crews', label: 'Crews' },
  { href: '/dispatch/service-types', label: 'Service types' },
  { href: '/dispatch/users', label: 'Staff' },
];

/** The one dispatch nav. Board owns /dispatch and every crew-day under it; the rest own their prefix. */
export function DispatchNav({ pending }: { pending: number }) {
  const path = usePathname();
  const on = (href: string) => path === href || path.startsWith(`${href}/`);
  const board = !ITEMS.some((i) => on(i.href));
  return (
    <nav aria-label="Dispatch">
      <Link href="/dispatch" aria-current={board ? 'page' : undefined}>Board</Link>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={on(i.href) ? 'page' : undefined}>
          {i.label}{i.href.endsWith('reschedules') && pending > 0 && <span className="badge" aria-label={`${pending} waiting`}>{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}
