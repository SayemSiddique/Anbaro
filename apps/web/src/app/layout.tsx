import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { themePrePaintScript } from '../lib/theme';

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
  // The browser chrome follows the theme: --ground from each ramp.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0b0c' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={snPro.variable} lang="en" suppressHydrationWarning>
      <head>
        {/* Stamps data-theme before first paint so an explicitly chosen theme
            never flashes the other one. Must run synchronously, ahead of the
            stylesheet applying, which is why it is inlined rather than a
            component effect. */}
        <script dangerouslySetInnerHTML={{ __html: themePrePaintScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
