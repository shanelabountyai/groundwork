import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import './globals.css';

export const metadata = { title: 'Groundwork' };

// Self-hosted by next/font at build time; system-ui is the fallback in globals.css.
const ui = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
