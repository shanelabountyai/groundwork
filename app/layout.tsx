import localFont from 'next/font/local';
import './globals.css';

export const metadata = { title: 'Groundwork' };

// Committed Latin subset (variable 200–800, SIL OFL) so builds need no network; system-ui is the fallback in globals.css.
const ui = localFont({
  src: './fonts/AtkinsonHyperlegibleNext-latin.woff2',
  weight: '200 800',
  variable: '--font-ui',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
