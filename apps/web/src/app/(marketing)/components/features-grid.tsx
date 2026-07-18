import {
  Barcode,
  Bell,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  LayoutGrid,
  MapPin,
  RotateCw,
  Users,
  WifiOff,
} from 'lucide-react';

import { Reveal } from './reveal';

const tints = {
  primary: { background: 'var(--mkt-primary-tint-10)', color: 'var(--primary)' },
  accent: { background: 'var(--mkt-accent-tint-15)', color: 'var(--accent)' },
  green: { background: 'rgb(40 200 64 / 10%)', color: 'var(--mkt-decorative-green, #28c840)' },
  muted: { background: 'rgb(68 65 64 / 10%)', color: 'var(--text-muted)' },
} as const;

const features = [
  {
    icon: MapPin,
    tint: tints.primary,
    title: 'Item & Location Tracking',
    desc: 'See what items you have and the quantity at each location. Organize by rooms, shelves, or warehouses.',
  },
  {
    icon: ClipboardCheck,
    tint: tints.accent,
    title: 'Guided Stock Counts',
    desc: 'Run repeatable counts that help staff count carefully and reconcile results without confusion.',
  },
  {
    icon: WifiOff,
    tint: tints.green,
    title: 'Offline Mobile Counting',
    desc: 'Keep counting in a back room or low-signal area. Changes sync automatically when connection returns.',
  },
  {
    icon: Barcode,
    tint: tints.primary,
    title: 'Barcode Scanning',
    desc: 'Use your phone camera to find or add items instantly. No separate scanner hardware needed.',
  },
  {
    icon: Bell,
    tint: tints.accent,
    title: 'Low-Stock Alerts',
    desc: 'Get notified before items run out. Set your own thresholds and stay ahead of shortages.',
  },
  {
    icon: History,
    tint: tints.muted,
    title: 'Stock History',
    desc: 'Clear record of every movement and adjustment. Understand exactly how and why quantities changed.',
  },
  {
    icon: Users,
    tint: tints.primary,
    title: 'Team Access',
    desc: 'Invite staff and give people the access they need. Everyone works from the same up-to-date numbers.',
  },
  {
    icon: FileSpreadsheet,
    tint: tints.accent,
    title: 'CSV Import & Export',
    desc: 'Bring in your existing catalog and take your data with you anytime. No lock-in, ever.',
  },
  {
    icon: RotateCw,
    tint: tints.green,
    title: 'Reorder Suggestions',
    desc: 'See suggested quantities based on target levels. Review the recommendation — you stay in control.',
  },
] as const;

export function FeaturesGrid() {
  return (
    <section className="features" id="features">
      <div className="section-container">
        <Reveal className="section-header">
          <div className="section-tag">
            <LayoutGrid aria-hidden="true" size={13} />
            Features
          </div>
          <h2 className="section-title">
            Everything you need,
            <br />
            nothing you don&apos;t.
          </h2>
          <p className="section-subtitle">
            Simple tools that answer the questions your team actually asks every day.
          </p>
        </Reveal>

        <div className="features-grid">
          {features.map((feature, index) => (
            <Reveal delay={((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6} key={feature.title}>
              <div className="feature-card">
                <div className="feature-icon" style={feature.tint}>
                  <feature.icon aria-hidden="true" size={20} />
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
