import Link from 'next/link';
import { connection } from 'next/server';
import { formState, type SearchParams } from '@/src/forms';
import { requireDispatcher } from '@/src/session';
import { createProperty } from '../actions';

export default async function NewProperty({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  await requireDispatcher();
  const sp = await searchParams;
  const { msg } = sp;
  const f = formState(sp);

  return (
    <main className="desk">
      <header className="bar">
        <h1>New property</h1>
        <nav className="links"><Link className="btn" href="/dispatch/properties">Properties</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createProperty}>
        <label>Customer name<input name="customerName" required {...f.props('customerName')} />{f.err('customerName')}</label>
        <label>Phone<input name="customerPhone" required {...f.props('customerPhone')} />{f.err('customerPhone')}</label>
        <label>Email (optional)<input name="customerEmail" type="email" {...f.props('customerEmail')} />{f.err('customerEmail')}</label>
        <label>Address<input name="address" required {...f.props('address')} />{f.err('address')}</label>
        <label>Latitude<input name="lat" type="number" step="any" required {...f.props('lat')} />{f.err('lat')}</label>
        <label>Longitude<input name="lng" type="number" step="any" required {...f.props('lng')} />{f.err('lng')}</label>
        <label>Access notes<textarea name="accessNotes" rows={2} {...f.props('accessNotes')} />{f.err('accessNotes')}</label>
        <label className="choice"><input type="checkbox" name="notifyOnEnRoute" defaultChecked />Text on en route</label>
        <button className="primary">Create property</button>
      </form>
    </main>
  );
}
