import { Barcode, Bell, Coffee, Droplets, MapPin, Package, Printer } from 'lucide-react';

import { StockBar } from './stock-bar';

const rows = [
  {
    icon: Coffee,
    tint: 'var(--mkt-primary-tint-10)',
    color: 'var(--primary)',
    name: 'Paper Cups (12oz)',
    location: 'Main Storeroom',
    qty: 24,
    percent: 20,
    tone: 'stock-low' as const,
  },
  {
    icon: Droplets,
    tint: 'rgb(40 200 64 / 10%)',
    color: 'var(--mkt-decorative-green, #28c840)',
    name: 'Hand Soap',
    location: 'Supply Closet',
    qty: 156,
    percent: 85,
    tone: 'stock-high' as const,
  },
  {
    icon: Package,
    tint: 'var(--mkt-accent-tint-15)',
    color: 'var(--accent)',
    name: 'Shipping Boxes (M)',
    location: 'Warehouse A',
    qty: 89,
    percent: 55,
    tone: 'stock-med' as const,
  },
  {
    icon: Printer,
    tint: 'var(--mkt-primary-tint-10)',
    color: 'var(--primary)',
    name: 'Printer Paper (A4)',
    location: 'Office',
    qty: 8,
    percent: 12,
    tone: 'stock-low' as const,
  },
];

export function HeroMockupCard() {
  return (
    <div className="hero-mockup">
      <div className="mockup-main">
        <div className="mockup-header">
          <span className="mockup-dot" />
          <span className="mockup-dot" />
          <span className="mockup-dot" />
        </div>
        <div className="mockup-body">
          {rows.map((row) => (
            <div className="mockup-row" key={row.name}>
              <div className="mockup-row-icon" style={{ background: row.tint, color: row.color }}>
                <row.icon aria-hidden="true" size={17} />
              </div>
              <div className="mockup-row-info">
                <div className="mockup-row-name">{row.name}</div>
                <div className="mockup-row-location">
                  <MapPin aria-hidden="true" size={10} />
                  {row.location}
                </div>
              </div>
              <div className="mockup-row-qty">
                <div className="mockup-row-qty-num">{row.qty}</div>
                <StockBar percent={row.percent} tone={row.tone} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="float-card float-card-1">
        <div className="float-card-icon" style={{ background: 'var(--primary)' }}>
          <Bell aria-hidden="true" size={16} />
        </div>
        <div>
          <div className="float-card-text">Low Stock Alert</div>
          <div className="float-card-sub">Paper Cups — 24 remaining</div>
        </div>
      </div>
      <div className="float-card float-card-2">
        <div
          className="float-card-icon"
          style={{ background: 'var(--mkt-decorative-green, #28c840)' }}
        >
          <Barcode aria-hidden="true" size={16} />
        </div>
        <div>
          <div className="float-card-text">Scan Complete</div>
          <div className="float-card-sub">Hand Soap added</div>
        </div>
      </div>
    </div>
  );
}
