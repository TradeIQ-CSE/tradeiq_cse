import {
  RiArrowRightLine,
  RiExchangeLine,
  RiFlaskLine,
  RiInformationLine,
  RiLineChartLine,
  RiPieChartLine,
  RiAddLine,
} from '@remixicon/react';
import { useTranslation } from 'react-i18next';
import { ButtonLink } from '@/components/base/buttons/button';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { LANDING_CONTAINER } from './layout';
import './landing.css';

const CAPABILITIES = [
  { key: 'markets', Icon: RiLineChartLine },
  { key: 'backtesting', Icon: RiFlaskLine },
  { key: 'paperTrading', Icon: RiExchangeLine },
  { key: 'portfolio', Icon: RiPieChartLine },
] as const;

const LIMITATIONS = ['marketData', 'execution', 'backtests', 'signals'] as const;
const FAQS = ['paperTrading', 'backtesting', 'account', 'advice', 'data'] as const;

export function HowItWorksPage() {
  const { t } = useTranslation();

  return (
    <div className="landing-page min-h-full bg-background-primary-default">
      <a href="#main-content" className="landing-skip-link">Skip to content</a>
      <LandingNav />
      <main id="main-content">
        <AuroraBackground className="landing-aurora">
          <div className="relative z-10 flex w-full flex-col gap-16 pb-20 pt-8 sm:gap-20 sm:pb-24 sm:pt-12">
            <section className={LANDING_CONTAINER}>
              <div className="landing-glass-panel landing-glass-panel-major flex flex-col items-center rounded-3xl px-6 py-14 text-center sm:px-10 sm:py-20">
                <p className="text-headline-semibold text-status-blue-text">{t('howItWorks.hero.eyebrow')}</p>
                <h1 className="landing-display mt-5 max-w-4xl text-display-4-bold text-text-primary sm:text-display-2-bold">
                  {t('howItWorks.hero.heading')}
                </h1>
                <p className="landing-lead mt-6 max-w-2xl text-headline-regular text-text-secondary">
                  {t('howItWorks.hero.description')}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <ButtonLink href="/markets" variant="primary" trailingIcon={RiArrowRightLine}>
                    {t('howItWorks.hero.browse')}
                  </ButtonLink>
                  <ButtonLink href="/signup" variant="secondary">
                    {t('howItWorks.hero.account')}
                  </ButtonLink>
                </div>
              </div>
            </section>

            <section className={LANDING_CONTAINER} aria-labelledby="capabilities-heading">
              <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
                <div className="max-w-3xl">
                  <p className="text-headline-semibold text-status-blue-text">{t('howItWorks.capabilities.eyebrow')}</p>
                  <h2 id="capabilities-heading" className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">
                    {t('howItWorks.capabilities.heading')}
                  </h2>
                  <p className="landing-lead mt-5 text-headline-regular text-text-secondary">
                    {t('howItWorks.capabilities.description')}
                  </p>
                </div>

                <ol className="mt-10 grid gap-4 md:grid-cols-2">
                  {CAPABILITIES.map(({ key, Icon }, index) => (
                    <li key={key} className="landing-glass-card flex items-start gap-4 rounded-3xl p-5 sm:p-6">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-secondary-default text-status-blue-text">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="text-body-semibold text-status-blue-text">
                          {t('howItWorks.capabilities.step', { number: index + 1 })}
                        </p>
                        <h3 className="mt-1 text-title-3-semibold text-text-primary">
                          {t(`howItWorks.capabilities.items.${key}.title`)}
                        </h3>
                        <p className="mt-2 text-body-regular text-text-secondary">
                          {t(`howItWorks.capabilities.items.${key}.description`)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section className={LANDING_CONTAINER} aria-labelledby="limitations-heading">
              <div className="landing-glass-panel landing-glass-panel-major grid gap-8 rounded-3xl p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:p-12">
                <div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-background-secondary-default text-status-blue-text">
                    <RiInformationLine className="size-5" aria-hidden />
                  </span>
                  <h2 id="limitations-heading" className="landing-display mt-5 text-display-4-bold text-text-primary">
                    {t('howItWorks.limitations.heading')}
                  </h2>
                  <p className="landing-lead mt-5 text-headline-regular text-text-secondary">
                    {t('howItWorks.limitations.description')}
                  </p>
                </div>
                <ul className="grid gap-3">
                  {LIMITATIONS.map((key) => (
                    <li key={key} className="landing-glass-card rounded-3xl p-5">
                      <h3 className="text-headline-semibold text-text-primary">
                        {t(`howItWorks.limitations.items.${key}.title`)}
                      </h3>
                      <p className="mt-2 text-body-regular text-text-secondary">
                        {t(`howItWorks.limitations.items.${key}.description`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={LANDING_CONTAINER} aria-labelledby="faq-heading">
              <div className="landing-glass-panel landing-glass-panel-major rounded-3xl p-6 sm:p-8 lg:p-12">
                <p className="text-headline-semibold text-status-blue-text">{t('howItWorks.faq.eyebrow')}</p>
                <h2 id="faq-heading" className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">
                  {t('howItWorks.faq.heading')}
                </h2>
                <div className="mt-8 divide-y divide-separator-border">
                  {FAQS.map((key) => (
                    <details key={key} className="group py-1">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-3 py-4 text-left text-headline-semibold text-text-primary outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                        {t(`howItWorks.faq.items.${key}.question`)}
                        <RiAddLine className="size-5 shrink-0 text-foreground-icon-secondary transition-transform group-open:rotate-45" aria-hidden />
                      </summary>
                      <p className="max-w-3xl px-3 pb-5 text-body-regular text-text-secondary">
                        {t(`howItWorks.faq.items.${key}.answer`)}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </AuroraBackground>
      </main>
      <LandingFooter />
    </div>
  );
}
