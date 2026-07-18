import { PlayCircle, Rocket, Sparkles } from 'lucide-react';

import { AnimatedCounter } from './animated-counter';
import { HeroMockupCard } from './hero-mockup-card';
import { ParticlesCanvas } from './particles-canvas';

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-bg-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>
      <ParticlesCanvas />

      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles aria-hidden="true" size={13} />
            Free to use — No credit card required
          </div>
          <h1 className="hero-title">
            Inventory without the <span className="highlight">spreadsheet chaos.</span>
          </h1>
          <p className="hero-subtitle">
            Know what you have, where it is, and what is running low. Count stock on your phone,
            scan barcodes, and give your team one reliable view of inventory.
          </p>
          <div className="hero-actions">
            <a className="btn-primary" href="#cta">
              <Rocket aria-hidden="true" size={17} />
              Start Tracking Inventory
            </a>
            <a className="btn-secondary" href="#how-it-works">
              <PlayCircle aria-hidden="true" size={17} />
              See How It Works
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-number">
                <AnimatedCounter suffix="%" target={100} />
              </div>
              <div className="hero-stat-label">Free Forever</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">
                <AnimatedCounter suffix="min" target={5} />
              </div>
              <div className="hero-stat-label">Setup Time</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">
                <AnimatedCounter target={0} />
              </div>
              <div className="hero-stat-label">Spreadsheets Needed</div>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <HeroMockupCard />
        </div>
      </div>
    </section>
  );
}
