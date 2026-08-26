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
  {
    icon: Coffee,
    swatch: 'primary',
    name: 'Paper Cups',
    qty: 24,
    low: true,
  },
  {
    icon: Droplets,
    swatch: 'green',
    name: 'Hand Soap',
    qty: 156,
    low: false,
  },
  {
    icon: Package,
    swatch: 'accent',
    name: 'Shipping Boxes',
    qty: 89,
    low: false,
  },
  {
    icon: Printer,
    swatch: 'primary',
    name: 'Printer Paper',
    qty: 8,
    low: true,
  },
  {
    icon: SoapDispenserDroplet,
    swatch: 'green',
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
              <div className={`phone-item-icon mkt-swatch-${item.swatch}`}>
                <item.icon aria-hidden="true" size={14} />
              </div>
              <div className="phone-item-name">{item.name}</div>
              {/* A low item keeps the rule's warning colour; the rest take
                  their own swatch's hue. */}
              <div
                className={item.low ? 'phone-item-qty' : `phone-item-qty mkt-ink-${item.swatch}`}
              >
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
