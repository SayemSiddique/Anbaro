'use client';

import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AnbaroWordmark } from '../../../components/brand';
import { MobileNav } from './mobile-nav';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#showcase', label: 'App' },
  { href: '#pricing', label: 'Pricing' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 50);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-container">
          <a className="nav-logo" href="#">
            <AnbaroWordmark size={30} />
          </a>
          <ul className="nav-links">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <a className="nav-cta" href="#cta">
                Try Free
              </a>
            </li>
          </ul>
          <button
            aria-label="Open menu"
            className="mobile-toggle"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>
      <MobileNav onClose={() => setMobileOpen(false)} open={mobileOpen} />
    </>
  );
}
