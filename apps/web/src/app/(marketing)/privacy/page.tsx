import type { Metadata } from 'next';
import Link from 'next/link';

import { AnbaroWordmark } from '../../../components/brand';
import { Footer } from '../components/footer';

/**
 * Public privacy policy served at `/privacy`.
 *
 * DRAFT — Session 2 pre-launch batch. Every value wrapped in [SQUARE BRACKETS]
 * is a fact only the operator holds and MUST be filled in before this page is
 * published or a mobile build is submitted (the App Store and Play Console both
 * require a reachable, accurate privacy URL). Search this file for `[` to find
 * every blank. Nothing here should be treated as legal advice — have it
 * reviewed before relying on it.
 *
 * Coverage mandated by the launch plan (Session 4 step 4): account data,
 * inventory data, camera/device usage, billing (dormant at launch), processor
 * (sub-processor) data, retention, deletion, and a support contact.
 */
export const metadata: Metadata = {
  title: 'Privacy Policy — Anbaro',
  description:
    'How Anbaro collects, uses, retains, and deletes your data, and the choices you have over it.',
};

const EFFECTIVE_DATE = '[EFFECTIVE DATE — e.g. 22 July 2026]';
const LEGAL_ENTITY = '[LEGAL ENTITY NAME]';
const ENTITY_ADDRESS = '[REGISTERED BUSINESS ADDRESS]';
const JURISDICTION = '[GOVERNING JURISDICTION — e.g. England & Wales]';
const PRIVACY_EMAIL = '[privacy@anbaro.com]';
const SUPPORT_EMAIL = 'support@anbaro.com';

/**
 * Sub-processors that actually touch personal data. Confirm this list against
 * the finalized stack before publishing — remove any you do not end up using
 * (e.g. Groq is optional; Stripe only applies once billing is enabled) and add
 * any that are missing.
 */
const subProcessors = [
  {
    name: 'Neon',
    purpose: 'Managed PostgreSQL database hosting (account & inventory data at rest).',
  },
  { name: 'Upstash', purpose: 'Managed Redis for sessions, rate limiting, and background jobs.' },
  { name: 'Railway', purpose: 'Hosting for the Anbaro API service.' },
  { name: 'Vercel', purpose: 'Hosting for the Anbaro web application.' },
  { name: 'Sentry', purpose: 'Error and performance monitoring (diagnostic data).' },
  {
    name: 'Postmark',
    purpose: 'Transactional email delivery (verification, password reset, invites, alerts).',
  },
  {
    name: 'Groq',
    purpose:
      'Optional AI assistant. Only the text you submit to the assistant is sent, and only when the feature is enabled.',
  },
  {
    name: 'Stripe',
    purpose:
      'Payment processing. Only applies once paid plans are enabled; Anbaro never stores full card details.',
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="legal-section">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <style>{`
        .legal-page { background: var(--surface); color: var(--text); min-height: 100vh; }
        .legal-topbar {
          display: flex; align-items: center; justify-content: space-between;
          max-width: 820px; margin: 0 auto; padding: 28px 24px 0;
        }
        .legal-topbar a { text-decoration: none; color: var(--text-muted); font-size: 15px; }
        .legal-topbar a:hover { color: var(--text); }
        .legal-body { max-width: 820px; margin: 0 auto; padding: 32px 24px 72px; }
        .legal-body h1 { font-size: 40px; line-height: 1.1; margin: 24px 0 8px; }
        .legal-effective { color: var(--text-soft); font-size: 15px; margin: 0 0 8px; }
        .legal-draft-note {
          background: var(--surface-subtle); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px; color: var(--text-muted);
          font-size: 14px; margin: 20px 0 8px;
        }
        .legal-lead { color: var(--text-muted); font-size: 18px; line-height: 1.6; }
        .legal-section { margin-top: 36px; }
        .legal-section h2 { font-size: 22px; margin: 0 0 10px; }
        .legal-section p, .legal-section li { color: var(--text-muted); font-size: 16px; line-height: 1.65; }
        .legal-section ul { margin: 8px 0 0; padding-left: 20px; }
        .legal-section li { margin-bottom: 6px; }
        .legal-section a { color: var(--primary); }
        .legal-proc { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .legal-proc th, .legal-proc td {
          text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
          font-size: 15px; color: var(--text-muted); vertical-align: top;
        }
        .legal-proc th { color: var(--text); font-weight: 600; }
      `}</style>

      <div className="legal-topbar">
        <Link aria-label="Anbaro home" href="/">
          <AnbaroWordmark size={28} />
        </Link>
        <Link href="/">← Back to home</Link>
      </div>

      <main className="legal-body">
        <h1>Privacy Policy</h1>
        <p className="legal-effective">Effective {EFFECTIVE_DATE}</p>

        <p className="legal-draft-note">
          <strong>Draft.</strong> This page is a pre-launch draft. Bracketed values (legal entity,
          address, jurisdiction, contact email, effective date) must be completed and the document
          reviewed before publication.
        </p>

        <p className="legal-lead">
          Anbaro is inventory software for small businesses. This policy explains what{' '}
          {LEGAL_ENTITY} (&ldquo;Anbaro&rdquo;, &ldquo;we&rdquo;) collects when you use the Anbaro
          web and mobile apps, why, how long we keep it, and the control you have over it.
        </p>

        <Section id="who-we-are" title="Who we are">
          <p>
            Anbaro is operated by {LEGAL_ENTITY}, {ENTITY_ADDRESS}. We are the data controller for
            the personal data described here. For any privacy question or request, contact us at{' '}
            <a href={`mailto:${PRIVACY_EMAIL.replace(/[[\]]/g, '')}`}>{PRIVACY_EMAIL}</a>.
          </p>
        </Section>

        <Section id="account-data" title="Account data">
          <p>When you create a workspace or are invited to one, we collect and store:</p>
          <ul>
            <li>Your name and email address.</li>
            <li>A securely hashed password (we never store your password in plain text).</li>
            <li>Your role and the location(s) you are a member of within a workspace.</li>
            <li>Authentication and session records needed to keep you signed in securely.</li>
          </ul>
        </Section>

        <Section id="inventory-data" title="Inventory and business data">
          <p>
            To provide the service we store the business data you enter: items and their barcodes,
            suppliers, locations, stock counts, stock movements, reorder settings, low-stock alerts,
            and CSV imports/exports you run. This data belongs to your workspace and is only visible
            to members of that workspace.
          </p>
        </Section>

        <Section id="camera-device" title="Camera and device access">
          <p>
            The mobile app requests camera access solely to scan product barcodes. Scanning happens
            on your device; we do not record video, capture photos, or upload camera imagery — only
            the decoded barcode value is used to look up or create an item. You can decline the
            permission and enter barcodes manually. The app may store data locally on your device so
            you can count while offline, syncing to your workspace when a connection returns.
          </p>
        </Section>

        <Section id="billing" title="Billing">
          <p>
            Anbaro is currently free, and payment processing is not active — we do not collect card
            or payment details at this time. If and when paid plans are introduced, payments will be
            handled by our payment processor (Stripe); Anbaro will receive only the subscription
            status and identifiers needed to manage your plan, never your full card number.
          </p>
        </Section>

        <Section id="processors" title="Service providers (sub-processors)">
          <p>
            We use a small set of trusted providers to run Anbaro. They process data only on our
            instructions and only as needed to deliver their service:
          </p>
          <table className="legal-proc">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {subProcessors.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="how-we-use" title="How we use your data">
          <p>We use the data above to:</p>
          <ul>
            <li>Provide, secure, and maintain the Anbaro service.</li>
            <li>Authenticate you and protect against abuse (e.g. rate limiting).</li>
            <li>
              Send transactional email you would expect: verification, password reset, teammate
              invites, and stock alerts.
            </li>
            <li>Diagnose errors and improve reliability.</li>
          </ul>
          <p>
            We do not sell your personal data, and we do not use your inventory data to advertise to
            you.
          </p>
        </Section>

        <Section id="retention" title="Data retention">
          <p>
            We keep your account and workspace data for as long as your account is active. Some
            records are, by design, append-only ledgers (for example the stock-event and count
            history) so your inventory audit trail stays trustworthy. Diagnostic and email-delivery
            logs are retained for a limited period by the relevant provider. [CONFIRM SPECIFIC
            RETENTION WINDOWS ONCE FINALIZED.]
          </p>
        </Section>

        <Section id="deletion" title="Deleting your account and data">
          <p>
            You can delete your account from within Anbaro at any time: on the web, from Account
            settings; on mobile, from <em>More → Delete account</em>. Deleting your account removes
            your personal profile and, where you are the sole owner, your workspace and its data,
            subject to any short residual backup windows and to records we must retain for legal or
            accounting reasons. You can also email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to request deletion.
          </p>
        </Section>

        <Section id="your-rights" title="Your rights">
          <p>
            Depending on where you live, you may have rights to access, correct, export, or delete
            your personal data, and to object to or restrict certain processing. To exercise any of
            these, contact{' '}
            <a href={`mailto:${PRIVACY_EMAIL.replace(/[[\]]/g, '')}`}>{PRIVACY_EMAIL}</a>. This
            policy is governed by the laws of {JURISDICTION}.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If we make material changes we will update the effective date above and, where
            appropriate, notify you by email. Continued use of Anbaro after a change means you
            accept the updated policy.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Questions about this policy or your data? Email{' '}
            <a href={`mailto:${PRIVACY_EMAIL.replace(/[[\]]/g, '')}`}>{PRIVACY_EMAIL}</a>, or reach
            support at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </Section>
      </main>

      <Footer />
    </div>
  );
}
