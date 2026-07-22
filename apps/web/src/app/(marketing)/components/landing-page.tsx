import { FeaturesGrid } from './features-grid';
import { FinalCta } from './final-cta';
import { FreeBanner } from './free-banner';
import { Footer } from './footer';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { IntroOverlay } from './intro-overlay';
import { Navbar } from './navbar';
import { Showcase } from './showcase';
import { ShowcaseLowStockCard } from './showcase-low-stock-card';
import { ShowcasePhoneMockup } from './showcase-phone-mockup';
import { TrustedBy } from './trusted-by';

export function LandingPage() {
  return (
    <>
      <IntroOverlay />
      <Navbar />
      <Hero />
      <TrustedBy />
      <FeaturesGrid />
      <HowItWorks />
      <Showcase
        bullets={[
          'Scan barcodes with your phone camera',
          'Continue counting even when Wi-Fi drops',
          'Changes sync automatically when back online',
          'No separate scanner hardware needed',
        ]}
        body="Anbaro's mobile app turns your phone into a powerful inventory tool. Walk through your stockroom, scan barcodes with the camera you already have, and update counts in real time."
        heading="Count stock from the floor, not from a desk."
        id="showcase"
        visual={<ShowcasePhoneMockup />}
      />
      <Showcase
        bullets={[
          'Set custom low-stock thresholds per item',
          'Get notified before you run out',
          'See reorder suggestions at a glance',
          'Review recommendations — you decide',
        ]}
        body="Low-stock alerts keep you ahead of shortages. See exactly what is running low, where it is, and how much to reorder — all in one clear view."
        canvasBackground
        heading="Stop guessing what is in the stockroom."
        reverse
        visual={<ShowcaseLowStockCard />}
      />
      {/*
        No testimonials section until there are real customers to quote. The
        component and its styles are removed rather than commented out; social
        proof under a "Real businesses, real results" heading has to be real.
      */}
      <FreeBanner />
      <FinalCta />
      <Footer />
    </>
  );
}
