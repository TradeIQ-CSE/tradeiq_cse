import { useTranslation } from 'react-i18next';
import { RiArrowRightLine, RiCheckLine, RiFlashlightLine, RiFlaskLine } from '@remixicon/react';
import { LinkButton } from '@/components/base/buttons/link-button';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './layout';

const WIZARD_STEPS = [
  { key: 'mode', state: 'done' },
  { key: 'strategy', state: 'active' },
  { key: 'market', state: 'todo' },
  { key: 'execution', state: 'todo' },
  { key: 'portfolio', state: 'todo' },
  { key: 'metrics', state: 'todo' },
  { key: 'results', state: 'todo' },
] as const;

// Rule-set DSL v1 is price-based only: exactly one buy condition plus one or
// more sell conditions (IMPLEMENTATION_PLAN.md decision D2). Indicator-based
// entries (MA/RSI/MACD/BB) are chart overlays in v1, so they must not be
// advertised here as selectable strategies.
const RULES = [
  { key: 'priceFalls', kind: 'buy', active: true },
  { key: 'takeProfit', kind: 'sell', active: true },
  { key: 'stopLoss', kind: 'sell', active: true },
  { key: 'endOfPeriod', kind: 'sell', active: false },
] as const;

const HIGHLIGHTS = [
  { key: 'quick', icon: RiFlashlightLine },
  { key: 'custom', icon: RiFlaskLine },
] as const;

/**
 * The "sample results" tiles that used to close this panel (+58.3% total
 * return, -12.4% max drawdown, 18.6% volatility) are gone. They were invented,
 * and a return figure on a public page for an investing product reads as a
 * performance claim whatever the label above it says. What is shown now is the
 * wizard and the rule set, both of which exist.
 */
export function LandingBacktesting() {
  const { t } = useTranslation();

  return (
    <section id="backtesting" className={LANDING_CONTAINER}>
      <div className="landing-glass-panel landing-glass-panel-major grid items-center gap-10 rounded-3xl p-6 sm:p-8 lg:grid-cols-2 lg:gap-16 lg:p-12">
      <div className="flex flex-col items-start">
        <span className="text-headline-semibold text-status-blue-text">
          {t('landing.backtesting.eyebrow')}
        </span>
        <h2 className="landing-display mt-4 text-display-4-bold text-text-primary sm:text-display-3-bold">
          {t('landing.backtesting.headingLine1')}<br />{t('landing.backtesting.headingLine2')}
        </h2>
        <p className="landing-lead mt-5 max-w-prose text-headline-regular text-text-secondary">
          {t('landing.backtesting.description')}
        </p>

        <div className="mt-6 flex w-full flex-col gap-3">
          {HIGHLIGHTS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="landing-glass-card flex items-start gap-3 rounded-3xl p-5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default">
                <Icon className="size-5 text-foreground-icon-primary" aria-hidden />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-headline-semibold text-text-primary">
                  {t(`landing.backtesting.${key}Title`)}
                </p>
                <p className="text-body-regular text-text-secondary">
                  {t(`landing.backtesting.${key}Description`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <LinkButton href="/backtests/new/security" trailingIcon={RiArrowRightLine} className="mt-5 text-title-3-semibold text-status-blue-text">
          {t('landing.backtesting.cta')}
        </LinkButton>
      </div>

      <div className="landing-glass-card flex flex-col gap-5 rounded-3xl p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-separator-border pb-5">
          <span className="text-headline-medium text-text-primary">{t('landing.backtesting.previewTitle')}</span>
          <span className="text-caption-1-medium text-text-secondary">{t('landing.backtesting.previewLabel')}</span>
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-2">
          {WIZARD_STEPS.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1.5">
              <span
                className={cx(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-caption-1-medium',
                  step.state === 'done' && 'bg-status-lime-background text-status-lime-text',
                  step.state === 'active' && 'bg-button-primary bui-on-accent',
                  step.state === 'todo' && 'bg-background-tertiary-default text-text-tertiary',
                )}
              >
                {step.state === 'done' ? (
                  <RiCheckLine className="size-3" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cx(
                  'text-body-2-medium',
                  step.state === 'todo' ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {t(`landing.backtesting.steps.${step.key}`)}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2 border-t border-separator-border pt-4">
          <p className="text-body-medium text-text-secondary">
            {t('landing.backtesting.selectStrategy')}
          </p>
          <div className="flex flex-wrap gap-2">
            {RULES.map((rule) => (
              <span
                key={rule.key}
                className={cx(
                  'rounded-lg px-2.5 py-1.5 text-body-2-medium',
                  rule.active
                    ? rule.kind === 'buy'
                      ? 'bg-status-lime-background text-status-lime-text'
                      : 'bg-status-rose-background text-status-rose-text'
                    : 'bg-background-tertiary-default text-text-tertiary',
                )}
              >
                {t(`landing.backtesting.rules.${rule.key}`)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-separator-border pt-4">
          <p className="text-body-medium text-text-secondary">
            {t('landing.backtesting.parameters')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background-primary-default px-3 py-2">
              <p className="text-body-2-medium text-text-tertiary">
                {t('landing.backtesting.takeProfitPct')}
              </p>
              <p className="text-headline-medium tabular-nums text-text-primary">10%</p>
            </div>
            <div className="rounded-lg bg-background-primary-default px-3 py-2">
              <p className="text-body-2-medium text-text-tertiary">
                {t('landing.backtesting.stopLossPct')}
              </p>
              <p className="text-headline-medium tabular-nums text-text-primary">5%</p>
            </div>
          </div>
        </div>
        <p className="text-caption-1-regular text-text-secondary">{t('landing.backtesting.previewNote')}</p>
      </div>
      </div>
    </section>
  );
}
