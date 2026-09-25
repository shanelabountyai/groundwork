import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export type SearchParams = Record<string, string | undefined>;

/**
 * Bounce back to a form with one message per bad field (`e.<name>`) and every
 * submitted value (`v.<name>`), so the page marks the field and keeps the rest
 * of the input. No client JS — the state rides in the query string.
 * ponytail: values are URL-visible, so never pass a secret field through here.
 */
export function backWithErrors(path: string, form: FormData, errors: Record<string, string>): never {
  const q = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === 'string' && k !== 'id' && !k.startsWith('$')) q.set(`v.${k}`, v);
  for (const [k, m] of Object.entries(errors)) q.set(`e.${k}`, m);
  revalidatePath(path.split('?')[0]!);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${q}`);
}

/** Read a bounce: `props` spreads onto an input, `err` renders under it. */
export function formState(sp: SearchParams) {
  return {
    /** `fallback` is the page's own default; a bounced value wins over it. */
    props(name: string, fallback?: string | number) {
      const value = sp[`v.${name}`] ?? fallback;
      const bad = sp[`e.${name}`] !== undefined;
      return {
        ...(value !== undefined && { defaultValue: value }),
        ...(bad && { 'aria-invalid': true, 'aria-describedby': `err-${name}` }),
      };
    },
    err(name: string) {
      const m = sp[`e.${name}`];
      return m ? <small className="err" id={`err-${name}`} role="alert">{m}</small> : null;
    },
  };
}
