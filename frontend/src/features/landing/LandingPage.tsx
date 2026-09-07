import { LandingNav } from './LandingNav';
import { LandingHero } from './LandingHero';
import { LandingMarketData } from './LandingMarketData';
import { LandingInsights } from './LandingInsights';
import { LandingBacktesting } from './LandingBacktesting';
import { LandingCta } from './LandingCta';
import { LandingFooter } from './LandingFooter';

/** One measure for every band on the page, so nothing sits off-centre. */
export const LANDING_CONTAINER = 'mx-auto w-full max-w-6xl px-6';

export function LandingPage() {
  return (
    <div className="min-h-full bg-background-primary-default">
      <LandingNav />
      <main className="flex flex-col gap-24 py-20 sm:gap-32">
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
