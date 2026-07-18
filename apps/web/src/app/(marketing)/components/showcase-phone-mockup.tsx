import {
  AlertCircle,
  BatteryFull,
  Coffee,
  Droplets,
  Package,
  Printer,
  Search,
  Signal,
  SoapDispenserDroplet,
  Wifi,
} from 'lucide-react';

const items = [
  { icon: Coffee, tint: 'var(--mkt-primary-tint-10)', color: 'var(--primary)', name: 'Paper Cups', qty: 24, low: true },
  {
    icon: Droplets,
    tint: 'rgb(40 200 64 / 10%)',
    color: 'var(--mkt-decorative-green, #28c840)',
    name: 'Hand Soap',
    qty: 156,
    low: false,
  },
  { icon: Package, tint: 'var(--mkt-accent-tint-15)', color: 'var(--accent)', name: 'Shipping Boxes', qty: 89, low: false },
  { icon: Printer, tint: 'var(--mkt-primary-tint-10)', color: 'var(--primary)', name: 'Printer Paper', qty: 8, low: true },
  {
    icon: SoapDispenserDroplet,
    tint: 'rgb(40 200 64 / 10%)',
    color: 'var(--mkt-decorative-green, #28c840)',
    name: 'Sanitizer',
    qty: 42,
    low: false,
  },
] as const;

export function ShowcasePhoneMockup() {
  return (
    <div className="showcase-phone">
      <div className="showcase-phone-screen">
        <div className="phone-status-bar">
          <span>9:41</span>
          <span className="phone-status-icons">
            <Signal aria-hidden="true" size={11} />
            <Wifi aria-hidden="true" size={11} />
            <BatteryFull aria-hidden="true" size={11} />
          </span>
        </div>
        <div className="phone-content">
          <div className="phone-search">
            <Search aria-hidden="true" size={13} />
            Search items...
          </div>
          {items.map((item) => (
            <div className="phone-item" key={item.name}>
              <div className="phone-item-icon" style={{ background: item.tint, color: item.color }}>
                <item.icon aria-hidden="true" size={14} />
              </div>
              <div className="phone-item-name">{item.name}</div>
              <div className="phone-item-qty" style={item.low ? undefined : { color: item.color }}>
                {item.qty}
                {item.low ? <AlertCircle aria-hidden="true" size={10} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
