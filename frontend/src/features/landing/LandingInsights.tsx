import { useTranslation } from 'react-i18next';
import { RiLineChartLine, RiPieChartLine, RiSparkling2Line } from '@remixicon/react';
import { Chip } from '../../components/base/badges/chip';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

/**
 * What this section used to be: six CSE symbols — JKH, COMB, DIAL, LOLC, HNB,
 * CTC — each with an invented up/flat/down probability split, under a heading
 * that called them a statistical model's output and copy that said they were
 * updated every trading day.
 *
 * None of it existed. The ML service is unbuilt (#61-#64 are open), so those
 * were fabricated predictions about real, named, publicly traded securities on
 * a public page. The plan is explicit that the landing page describes only
 * what is implemented or is clearly identified as upcoming, and this is the
 * clearest case of it on the site.
 *
 * The capability is still worth stating, because it is genuinely planned — so
 * it is stated as planned, with nothing standing in for the numbers.
 */
const CAPABILITIES = [
  { key: 'charting', icon: RiLineChartLine, available: true },
  { key: 'portfolio', icon: RiPieChartLine, available: true },
  { key: 'signals', icon: RiSparkling2Line, available: false },
] as const;

export function LandingInsights() {
  const { t } = useTranslation();

  return (
    <section className={cx(LANDING_CONTAINER, 'flex flex-col items-center text-center')}>
      <span className="text-body-medium text-status-blue-text">
        {t('landing.insights.eyebrow')}
      </span>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">
        {t('landing.insights.heading')}
      </h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
        {t('landing.insights.description')}
      </p>

      <ul className="mt-10 grid w-full gap-4 sm:grid-cols-3">
        {CAPABILITIES.map(({ key, icon: Icon, available }) => (
          <li
            key={key}
            className="flex flex-col items-start gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-5 text-left"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-background-secondary-default">
              <Icon className="size-5 text-foreground-icon-primary" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-headline-medium text-text-primary">
                {t(`landing.insights.capabilities.${key}.title`)}
              </h3>
              {!available && (
                <Chip variant="caption" color="soft">
                  {t('landing.insights.planned')}
                </Chip>
              )}
            </div>
            <p className="text-body-regular leading-relaxed text-text-secondary">
              {t(`landing.insights.capabilities.${key}.description`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
