import { AnbaroWordmark } from '../../../components/brand';
import { GithubIcon, InstagramIcon, LinkedinIcon, XIcon } from './social-icons';

/**
 * Links to pages that don't exist yet render as visibly inert placeholders
 * (muted, non-interactive, out of tab order) rather than live-looking dead
 * links, since /help, /blog, /about, /privacy, etc. aren't real routes in this
 * app yet — see the landing-page implementation plan for the reasoning.
 */
function InertLink({ label }: { label: string }) {
  return (
    <span aria-disabled="true" className="footer-link-inert">
      {label}
    </span>
  );
}

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];

const resourceLinks = ['Help Center', 'Blog', 'CSV Templates', 'API Docs'];
const companyLinks = ['About', 'Contact', 'Privacy', 'Terms'];

const socials = [
  { Icon: XIcon, label: 'X (Twitter)' },
  { Icon: LinkedinIcon, label: 'LinkedIn' },
  { Icon: GithubIcon, label: 'GitHub' },
  { Icon: InstagramIcon, label: 'Instagram' },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="nav-logo" href="#">
              <AnbaroWordmark dark size={30} />
            </a>
            <p>
              Simple inventory management for small businesses. Know what you have, where it is, and
              what is running low.
            </p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              {productLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
              <li>
                <InertLink label="Download" />
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <ul>
              {resourceLinks.map((label) => (
                <li key={label}>
                  <InertLink label={label} />
                </li>
              ))}
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              {companyLinks.map((label) => (
                <li key={label}>
                  <InertLink label={label} />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Anbaro. Built with care for small businesses.</p>
          <div className="footer-socials">
            {socials.map(({ Icon, label }) => (
              <span
                aria-disabled="true"
                aria-label={label}
                className="footer-social-item"
                key={label}
              >
                <Icon />
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
