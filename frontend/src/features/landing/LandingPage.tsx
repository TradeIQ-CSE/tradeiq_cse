import { LandingNav } from './LandingNav';
import { LandingHero } from './LandingHero';
import { LandingMarketData } from './LandingMarketData';
import { LandingInsights } from './LandingInsights';
import { LandingBacktesting } from './LandingBacktesting';
import { LandingCta } from './LandingCta';
import { LandingFooter } from './LandingFooter';
import './landing.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingMarketData />
        <LandingInsights />
        <LandingBacktesting />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
