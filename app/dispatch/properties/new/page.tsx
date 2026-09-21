import Link from 'next/link';
import { connection } from 'next/server';
import { requireDispatcher } from '@/src/session';
import { createProperty } from '../actions';

export default async function NewProperty({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await connection();
  await requireDispatcher();
  const { msg } = await searchParams;

  return (
    <main className="desk">
      <header className="bar">
        <h1>New property</h1>
        <nav className="links"><Link className="btn" href="/dispatch/properties">Properties</Link></nav>
      </header>
      {msg && <p className="alert" role="status">{msg}</p>}
      <form action={createProperty}>
        <label>Customer name<input name="customerName" required /></label>
        <label>Phone<input name="customerPhone" required /></label>
        <label>Email (optional)<input name="customerEmail" type="email" /></label>
        <label>Address<input name="address" required /></label>
        <label>Latitude<input name="lat" type="number" step="any" required /></label>
        <label>Longitude<input name="lng" type="number" step="any" required /></label>
        <label>Access notes<textarea name="accessNotes" rows={2} /></label>
        <label className="choice"><input type="checkbox" name="notifyOnEnRoute" defaultChecked />Text on en route</label>
        <button className="primary">Create property</button>
      </form>
    </main>
  );
}
