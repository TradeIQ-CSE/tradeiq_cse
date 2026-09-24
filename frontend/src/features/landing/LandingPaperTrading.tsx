import { useTranslation } from 'react-i18next';
import { RiArrowRightLine, RiLineChartLine, RiShieldLine, RiWallet3Line } from '@remixicon/react';
import { LinkButton } from '@/components/base/buttons/link-button';
import { localeFor } from '@/i18n';
import { cx } from '../../utils/cx';
import { formatCount, formatPrice } from '../markets/format';
import { LandingFacts } from './LandingFacts';
import { LANDING_CONTAINER } from './layout';

const FACTS = [
  { key: 'virtualMoney', icon: RiWallet3Line },
  { key: 'nothingReal', icon: RiShieldLine },
  { key: 'track', icon: RiLineChartLine },
] as const;

// A worked example, not a quote: round sample numbers so the arithmetic is
// easy to follow. The fee rate is the real CSE total the order ticket uses
// (1.12%, docs/api/paper-trading-v1.md §3.2) so the example never understates costs.
const EXAMPLE = {
  symbol: 'JKH.N0000',
  company: 'John Keells Holdings PLC',
  quantity: 1_000,
  price: 20,
  feeRate: 0.0112,
};

/**
 * The paper-trading counterpart of LandingBacktesting: same panel, mirrored
 * so the page alternates. The preview is an order ticket with sample
 * figures — like the backtest panel, it shows how the feature works and
 * makes no performance claim.
 */
export function LandingPaperTrading() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const cost = EXAMPLE.quantity * EXAMPLE.price;
  const fees = cost * EXAMPLE.feeRate;
  const total = cost + fees;
  const rows = [
    { key: 'price', value: `Rs. ${formatPrice(EXAMPLE.price, locale)}` },
    { key: 'cost', value: `Rs. ${formatPrice(cost, locale)}` },
    { key: 'fees', value: `Rs. ${formatPrice(fees, locale)}` },
  ];

  return (
    <section id="paper-trading" className={LANDING_CONTAINER}>
      <div className="landing-glass-panel landing-glass-panel-major grid items-center gap-10 rounded-3xl p-6 sm:p-8 lg:grid-cols-2 lg:gap-16 lg:p-12">
        <div className="flex flex-col items-start lg:order-2">
          <span className="text-headline-semibold text-status-blue-text">
            {t('landing.paperTrading.eyebrow')}
          </span>
          <h2 className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">
            {t('landing.paperTrading.headingLine1')}<br />{t('landing.paperTrading.headingLine2')}
          </h2>

          <LandingFacts facts={FACTS.map(({ key, icon }) => ({ text: t(`landing.paperTrading.facts.${key}`), icon }))} />

          <LinkButton href="/paper-trading" trailingIcon={RiArrowRightLine} className="mt-8 text-title-3-semibold text-status-blue-text">
            {t('landing.paperTrading.cta')}
          </LinkButton>
        </div>

        <div className="landing-glass-card flex flex-col gap-5 rounded-3xl p-5 sm:p-8 lg:order-1">
          <div className="flex items-center justify-between gap-4 border-b border-separator-border pb-5">
            <span className="text-headline-medium text-text-primary">{t('landing.paperTrading.previewTitle')}</span>
            <span className="text-caption-1-medium text-text-secondary">{t('landing.paperTrading.previewLabel')}</span>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-background-tertiary-default p-1" aria-hidden>
            {(['buy', 'sell'] as const).map((side) => (
              <span
                key={side}
                className={cx(
                  'rounded-lg py-1.5 text-center text-body-2-medium',
                  side === 'buy'
                    ? 'bg-status-lime-background text-status-lime-text'
                    : 'text-text-tertiary',
                )}
              >
                {t(`landing.paperTrading.${side}`)}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-medium text-text-primary">{EXAMPLE.symbol}</span>
              <span className="truncate text-caption-1-regular text-text-secondary">{EXAMPLE.company}</span>
            </span>
            <span className="shrink-0 rounded-lg bg-background-primary-default px-3 py-2 text-right">
              <span className="block text-caption-1-medium text-text-tertiary">{t('landing.paperTrading.quantity')}</span>
              <span className="text-headline-medium tabular-nums text-text-primary">
                {t('landing.paperTrading.shares', { count: EXAMPLE.quantity, formattedCount: formatCount(EXAMPLE.quantity, locale) })}
              </span>
            </span>
          </div>

          <dl className="flex flex-col gap-2 border-t border-separator-border pt-4">
            {rows.map((row) => (
              <div key={row.key} className="flex justify-between gap-3 text-body-2-medium">
                <dt className="text-text-secondary">{t(`landing.paperTrading.rows.${row.key}`)}</dt>
                <dd className="tabular-nums text-text-primary">{row.value}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-separator-border pt-3">
              <dt className="text-headline-medium text-text-primary">{t('landing.paperTrading.rows.total')}</dt>
              <dd className="text-headline-medium tabular-nums text-text-primary">Rs. {formatPrice(total, locale)}</dd>
            </div>
          </dl>

          <p className="text-caption-1-regular text-text-secondary">{t('landing.paperTrading.previewNote')}</p>
        </div>
      </div>
    </section>
  );
}
