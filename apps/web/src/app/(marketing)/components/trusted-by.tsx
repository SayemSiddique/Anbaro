import { Building2, Scissors, Store, UtensilsCrossed, Warehouse } from 'lucide-react';

const teams = [
  { icon: Store, label: 'Retail Shops' },
  { icon: UtensilsCrossed, label: 'Restaurants' },
  { icon: Scissors, label: 'Salons' },
  { icon: Warehouse, label: 'Warehouses' },
  { icon: Building2, label: 'Offices' },
];

export function TrustedBy() {
  return (
    <section className="trusted">
      <div className="trusted-container">
        <div className="trusted-label">Built for teams like</div>
        <div className="trusted-icons">
          {teams.map((team) => (
            <div className="trust-item" key={team.label}>
              <team.icon aria-hidden="true" size={20} />
              {team.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
