import Link from 'next/link';

export default function Home() {
  return (
    <main className="crew">
      <h1>Groundwork</h1>
      <p>Evergreen Property Care — routes and crews.</p>
      <Link className="btn primary" href="/crew">Crew view</Link>
    </main>
  );
}
