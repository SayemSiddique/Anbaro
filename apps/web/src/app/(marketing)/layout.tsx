import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import './marketing.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`marketing-scope ${inter.variable} ${plusJakartaSans.variable}`}>
      {children}
    </div>
  );
}
