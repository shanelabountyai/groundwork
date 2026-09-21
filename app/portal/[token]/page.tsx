import { portalSignIn } from '../actions';

/**
 * The link lands here and the button spends it — same reason as
 * app/login/[token]/page.tsx: a GET that signed you in would be spent by
 * whatever previews the link first (mail scanners, SMS unfurling).
 */
export default async function PortalLogin({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="crew">
      <h1>Evergreen Property Care</h1>
      <form action={portalSignIn} className="stops">
        <input type="hidden" name="token" value={token} />
        <button className="primary">View my schedule</button>
      </form>
    </main>
  );
}
