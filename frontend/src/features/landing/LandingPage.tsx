import { LandingNav } from './LandingNav';
import { LandingHero } from './LandingHero';
import { LandingMarketSection } from './LandingMarketSection';
import { LandingInsights } from './LandingInsights';
import { LandingBacktesting } from './LandingBacktesting';
import { LandingCta } from './LandingCta';
import { LandingFooter } from './LandingFooter';
import { AuroraBackground } from '@/components/ui/aurora-background';
import './landing.css';

export function LandingPage() {
  return (
    <div className="landing-page min-h-full bg-background-primary-default">
      <a href="#main-content" className="landing-skip-link">Skip to content</a>
      <LandingNav />
      <main id="main-content">
        <AuroraBackground className="landing-aurora">
          <div className="relative z-10 flex w-full flex-col gap-20 pb-20 pt-6 sm:gap-24 sm:pb-24 sm:pt-8">
            <LandingHero />
            <LandingMarketSection />
            <LandingInsights />
            <LandingBacktesting />
            <LandingCta />
          </div>
        </AuroraBackground>
      </main>
      <LandingFooter />
    </div>
  );
}
