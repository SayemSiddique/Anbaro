import { Bell } from 'lucide-react';

const rows = [
  {
    name: 'Paper Cups (12oz)',
    location: 'Main Storeroom',
    qty: 24,
    target: 200,
    reorder: 176,
    tone: 'tone-primary' as const,
  },
  {
    name: 'Printer Paper (A4)',
    location: 'Office',
    qty: 8,
    target: 50,
    reorder: 42,
    tone: 'tone-primary' as const,
  },
  {
    name: 'Napkins (Pack)',
    location: 'Kitchen',
    qty: 15,
    target: 100,
    reorder: 85,
    tone: 'tone-accent' as const,
  },
];

export function ShowcaseLowStockCard() {
  return (
    <div className="low-stock-card">
      <div className="low-stock-card-header">
        <div>
          <div className="low-stock-card-title">Low Stock Items</div>
          <div className="low-stock-card-subtitle">3 items need attention</div>
        </div>
        <div className="low-stock-card-icon">
          <Bell aria-hidden="true" size={17} />
        </div>
      </div>
      <div>
        {rows.map((row) => (
          <div className={`low-stock-row ${row.tone}`} key={row.name}>
            <div className="low-stock-row-info">
              <div className="low-stock-row-name">{row.name}</div>
              <div className="low-stock-row-location">{row.location}</div>
            </div>
            <div>
              <div className="low-stock-row-figures">
                {row.qty} / {row.target}
              </div>
              <div className="low-stock-row-reorder">Reorder {row.reorder}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
