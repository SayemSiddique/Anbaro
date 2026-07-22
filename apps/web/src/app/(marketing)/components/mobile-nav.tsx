'use client';

import { X } from 'lucide-react';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#showcase', label: 'App' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#cta', label: 'Try Free' },
];

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`mobile-nav${open ? ' open' : ''}`}>
      <button aria-label="Close menu" className="mobile-nav-close" onClick={onClose} type="button">
        <X size={22} />
      </button>
      {links.map((link) => (
        <a href={link.href} key={link.href} onClick={onClose}>
          {link.label}
        </a>
      ))}
    </div>
  );
}
