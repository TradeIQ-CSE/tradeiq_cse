import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RiCheckLine, RiFlashlightLine, RiFlaskLine } from '@remixicon/react';
import { cx } from '../../utils/cx';
import { LANDING_CONTAINER } from './LandingPage';

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
 * The "sample results" tiles that used to close this panel — +58.3% total
 * return, -12.4% max drawdown, 18.6% volatility — are gone. They were invented,
 * and a return figure on a public page for an investing product reads as a
 * performance claim whatever the label above it says. What is shown now is the
 * wizard and the rule set, both of which exist.
 */
export function LandingBacktesting() {
  const { t } = useTranslation();

  return (
    <section className={cx(LANDING_CONTAINER, 'grid items-center gap-10 lg:grid-cols-2')}>
      <div className="flex flex-col items-start">
        <span className="text-body-medium text-status-blue-text">
          {t('landing.backtesting.eyebrow')}
        </span>
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">
          {t('landing.backtesting.headingLine1')} {t('landing.backtesting.headingLine2')}
        </h2>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-text-secondary">
          {t('landing.backtesting.description')}
        </p>

        <div className="mt-6 flex w-full flex-col gap-3">
          {HIGHLIGHTS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background-secondary-default">
                <Icon className="size-5 text-foreground-icon-primary" aria-hidden />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-headline-medium text-text-primary">
                  {t(`landing.backtesting.${key}Title`)}
                </p>
                <p className="text-body-regular text-text-secondary">
                  {t(`landing.backtesting.${key}Description`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <Link
          to="/backtests/new/security"
          className="mt-5 text-body-medium text-status-blue-text hover:underline"
        >
          {t('landing.backtesting.cta')}
        </Link>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-border-button-default bg-background-secondary-default p-5">
        <ol className="flex flex-wrap gap-x-4 gap-y-2">
          {WIZARD_STEPS.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1.5">
              <span
                className={cx(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-caption-1-medium',
                  step.state === 'done' && 'bg-status-lime-background text-status-lime-text',
                  step.state === 'active' && 'bg-button-primary text-text-white',
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
      </div>
    </section>
  );
}
