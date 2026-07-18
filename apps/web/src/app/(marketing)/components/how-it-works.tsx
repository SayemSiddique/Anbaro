import { MapPin, PlusCircle, Route, Smartphone, TrendingUp } from 'lucide-react';

import { Reveal } from './reveal';

const steps = [
  {
    icon: PlusCircle,
    title: 'Add Your Items',
    desc: 'Import from CSV or add items manually. Set units, pack sizes, and target levels.',
  },
  {
    icon: MapPin,
    title: 'Set Locations',
    desc: 'Define your storerooms, shelves, or warehouses. Assign items to where they actually live.',
  },
  {
    icon: Smartphone,
    title: 'Count & Scan',
    desc: 'Use your phone to count stock and scan barcodes. Works offline, syncs automatically.',
  },
  {
    icon: TrendingUp,
    title: 'Stay Ahead',
    desc: 'Get low-stock alerts, see history, and reorder with confidence. Your whole team stays aligned.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="how-it-works" id="how-it-works">
      <div className="steps-container">
        <Reveal className="section-header">
          <div className="section-tag">
            <Route aria-hidden="true" size={13} />
            How It Works
          </div>
          <h2 className="section-title">Up and running in minutes.</h2>
          <p className="section-subtitle">
            No implementation project. No training videos. Just straightforward steps.
          </p>
        </Reveal>

        <div className="steps-grid">
          {steps.map((step, index) => (
            <Reveal delay={(index + 1) as 1 | 2 | 3 | 4} key={step.title}>
              <div className="step-card">
                <div className="step-number">{index + 1}</div>
                <div className="step-icon-wrap">
                  <step.icon aria-hidden="true" size={26} />
                </div>
                <h4 className="step-title">{step.title}</h4>
                <p className="step-desc">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
