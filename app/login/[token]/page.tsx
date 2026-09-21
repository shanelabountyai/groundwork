import { signIn } from '../../actions';

/**
 * The link lands here and the button spends it. A GET that signed you in
 * would be spent by whatever previews the link first (mail scanners, SMS
 * unfurling), leaving the person holding a dead link.
 */
export default async function Login({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="crew">
      <h1>Groundwork</h1>
      <form action={signIn} className="stops">
        <input type="hidden" name="token" value={token} />
        <button className="primary">Sign in</button>
      </form>
    </main>
  );
}
