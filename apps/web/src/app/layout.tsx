import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Counted — Inventory that adds up',
    template: '%s · Counted',
  },
  description:
    'Counted is simple multi-location inventory for any business: know what you have, where it is, and what is running low — with guided counts, barcode scanning, and low-stock alerts.',
  applicationName: 'Counted',
};

export const viewport: Viewport = {
  themeColor: '#1E1E24',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
