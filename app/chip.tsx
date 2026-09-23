const KIND = { pending: '', enroute: 'st-enroute', done: 'st-done', skip: 'st-skip', hold: 'st-hold', bad: 'st-bad' } as const;
export type ChipKind = keyof typeof KIND;

/** A status is a shape plus a word, never colour alone (Design canvas: Components). */
export function Chip({ kind, children }: { kind: ChipKind; children: React.ReactNode }) {
  return <span className={`chip status ${KIND[kind]}`}><i aria-hidden="true" />{children}</span>;
}

/** Visit status → chip. The words are pinned by the e2e suite: To do, En route, Done, Skipped. */
export const VISIT_CHIP = { pending: ['pending', 'To do'], en_route: ['enroute', 'En route'], completed: ['done', 'Done'], skipped: ['skip', 'Skipped'] } as const;
export function VisitChip({ status }: { status: keyof typeof VISIT_CHIP }) {
  const [kind, label] = VISIT_CHIP[status];
  return <Chip kind={kind}>{label}</Chip>;
}

export const INVOICE_CHIP: Record<string, ChipKind> = { draft: 'pending', sent: 'hold', paid: 'done', payment_failed: 'bad', refunded: 'skip', void: 'skip' };
