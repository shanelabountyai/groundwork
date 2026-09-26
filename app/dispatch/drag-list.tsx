'use client';

import { useRef, useTransition, type DragEvent, type ReactNode } from 'react';
import { dropStops } from './actions';

/**
 * Drag a stop onto another to put it there. The server-rendered `<li data-id>`
 * rows are the source of truth; the ↑/↓ buttons stay as the keyboard and touch path.
 */
export function DragList({ crewId, date, children }: { crewId: string; date: string; children: ReactNode }) {
  const from = useRef<string | null>(null);
  const [busy, start] = useTransition();
  const row = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('li[data-id]');

  function drop(e: DragEvent<HTMLOListElement>) {
    e.preventDefault();
    const to = row(e)?.dataset.id;
    const order = [...e.currentTarget.querySelectorAll<HTMLElement>(':scope > li[data-id]')].map((li) => li.dataset.id!);
    const i = order.indexOf(from.current ?? ''), j = order.indexOf(to ?? '');
    from.current = null;
    if (i < 0 || j < 0 || i === j) return;
    order.splice(j, 0, ...order.splice(i, 1));
    start(() => dropStops(crewId, date, order));
  }

  return (
    <ol
      className="stops"
      aria-busy={busy}
      onDragStart={(e) => { from.current = row(e)?.dataset.id ?? null; e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {children}
    </ol>
  );
}
