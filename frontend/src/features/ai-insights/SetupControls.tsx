import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectItem } from '../../components/base/select/select';
import { InfoTip } from '../../components/domain/info-tip';
import { formatFraction } from './format';
import type { PredictionSetup } from './types';

function options(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function SetupControls({ catalog, setup, onChange, locale }: {
  catalog: PredictionSetup[];
  setup: PredictionSetup;
  onChange: (key: string) => void;
  locale: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  // Keep the current evaluation window when selecting another supported setup.
  const preferred = [...catalog].sort((a, b) => Number(b.test_days === setup.test_days) - Number(a.test_days === setup.test_days));
  const forTarget = preferred.filter((item) => item.take_profit_pct === setup.take_profit_pct);
  const forLoss = forTarget.filter((item) => item.stop_loss_pct === setup.stop_loss_pct);

  function changeTarget(value: number) {
    const matches = preferred.filter((item) => item.take_profit_pct === value);
    const next = matches.find((item) => item.stop_loss_pct === setup.stop_loss_pct && item.horizon_bars === setup.horizon_bars)
      ?? matches.find((item) => item.stop_loss_pct === setup.stop_loss_pct) ?? matches[0];
    if (next) onChange(next.config_key);
  }

  function changeLoss(value: number) {
    const matches = forTarget.filter((item) => item.stop_loss_pct === value);
    const next = matches.find((item) => item.horizon_bars === setup.horizon_bars) ?? matches[0];
    if (next) onChange(next.config_key);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id={`${baseId}-target`} className="text-body-medium text-text-primary">{t('aiInsights.setup.target')}</span>
        <Select aria-labelledby={`${baseId}-target`} selectedKey={String(setup.take_profit_pct)} onSelectionChange={(key) => changeTarget(Number(key))}>
          {options(catalog.map((item) => item.take_profit_pct)).map((value) => (
            <SelectItem key={value} id={String(value)} textValue={formatFraction(value, locale)}>{formatFraction(value, locale)}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id={`${baseId}-loss`} className="text-body-medium text-text-primary">{t('aiInsights.setup.loss')}</span>
        <Select aria-labelledby={`${baseId}-loss`} selectedKey={String(setup.stop_loss_pct)} onSelectionChange={(key) => changeLoss(Number(key))}>
          {options(forTarget.map((item) => item.stop_loss_pct)).map((value) => (
            <SelectItem key={value} id={String(value)} textValue={formatFraction(value, locale)}>{formatFraction(value, locale)}</SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id={`${baseId}-horizon`} className="inline-flex items-center gap-1 text-body-medium text-text-primary">
          <span>{t('aiInsights.setup.horizon')}</span>
          <InfoTip label={t('aiInsights.setup.horizon')} ariaLabel={t('aiInsights.setup.horizonHelpLabel')}>{t('aiInsights.setup.horizonHelp')}</InfoTip>
        </span>
        <Select aria-label={t('aiInsights.setup.horizon')} selectedKey={String(setup.horizon_bars)} onSelectionChange={(key) => {
          const next = forLoss.find((item) => item.horizon_bars === Number(key));
          if (next) onChange(next.config_key);
        }}>
          {options(forLoss.map((item) => item.horizon_bars)).map((value) => (
            <SelectItem key={value} id={String(value)} textValue={t('aiInsights.tradingDays', { count: value })}>{t('aiInsights.tradingDays', { count: value })}</SelectItem>
          ))}
        </Select>
      </div>
      <p className="text-body-2-regular text-text-secondary sm:col-span-3">{t('aiInsights.setup.availableOnly')}</p>
    </div>
  );
}
