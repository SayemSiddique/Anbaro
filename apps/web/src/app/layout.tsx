import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * SN Pro — the single brand typeface (see packages/design-tokens typography).
 * Self-hosted variable font; every route inherits it via --font-sn-pro →
 * --font-sans in globals.css. Swap the file + tokens to change it app-wide.
 */
const snPro = localFont({
  src: '../fonts/SNPro-Variable.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-sn-pro',
});

export const metadata: Metadata = {
  title: {
    default: 'Anbaro — Inventory that adds up',
    template: '%s · Anbaro',
  },
  description:
    'Anbaro is simple multi-location inventory for any business: know what you have, where it is, and what is running low — with guided counts, barcode scanning, and low-stock alerts.',
  applicationName: 'Anbaro',
};

export const viewport: Viewport = {
  themeColor: '#1E1E24',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={snPro.variable} lang="en">
      <body>{children}</body>
    </html>
  );
}
