import { useTranslation } from 'react-i18next';
import { RiCheckboxCircleLine, RiInformationLine } from '@remixicon/react';
import { AppNotice, AppPanel } from '../../components/application/layout/application-layout';
import { Chip } from '../../components/base/badges/chip';
import { InfoTip } from '../../components/domain/info-tip';
import { formatDataDate, formatFraction, formatGeneratedAt } from './format';
import type { SavedPrediction } from './types';

export function PredictionResult({ prediction, latestPriceDate, locale }: {
  prediction: SavedPrediction;
  latestPriceDate?: string | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const setup = prediction.configuration;
  const dataDate = formatDataDate(prediction.data_as_of, locale);
  const SignalIcon = prediction.is_long_signal ? RiCheckboxCircleLine : RiInformationLine;

  return (
    <AppPanel className="flex flex-col gap-5" aria-label={t('aiInsights.result.title')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-1 text-headline-medium text-text-primary">
            {t('aiInsights.result.title')}
            <InfoTip label={t('aiInsights.result.title')} ariaLabel={t('aiInsights.result.helpLabel')}>{t('aiInsights.result.help')}</InfoTip>
          </h2>
          <p className="mt-1 text-body-2-regular text-text-secondary">{t('aiInsights.result.dataThrough', { date: dataDate })}</p>
        </div>
        <Chip color={prediction.is_long_signal ? 'lime' : 'soft'} variant="subtle" className="gap-1.5 whitespace-normal">
          <SignalIcon className="size-4" aria-hidden />
          {t(prediction.is_long_signal ? 'aiInsights.result.signal' : 'aiInsights.result.noSignal')}
        </Chip>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-display-2-semibold tabular-nums text-text-primary">{formatFraction(prediction.prob_long, locale)}</p>
        <p className="max-w-2xl text-body-regular text-text-secondary">
          {t('aiInsights.result.question', {
            date: dataDate,
            target: formatFraction(setup.take_profit_pct, locale),
            loss: formatFraction(setup.stop_loss_pct, locale),
            count: setup.horizon_bars,
          })}
        </p>
        <p className="text-body-2-regular text-text-secondary">{t(prediction.is_long_signal ? 'aiInsights.result.signalMeaning' : 'aiInsights.result.noSignalMeaning')}</p>
      </div>

      {latestPriceDate && latestPriceDate > prediction.data_as_of && (
        <AppNotice tone="warning" title={t('aiInsights.result.olderTitle')}>
          {t('aiInsights.result.older', { date: formatDataDate(latestPriceDate, locale) })}
        </AppNotice>
      )}

      <p className="border-t border-separator-border pt-4 text-body-2-regular text-text-secondary">{t('aiInsights.result.caution')}</p>
      <details className="border-t border-separator-border pt-4">
        <summary className="cursor-pointer text-body-medium text-text-primary">{t('aiInsights.result.details')}</summary>
        <dl className="mt-3 grid gap-3 text-body-2-regular sm:grid-cols-2">
          <div><dt className="text-text-secondary">{t('aiInsights.result.generated')}</dt><dd className="mt-1 text-text-primary">{formatGeneratedAt(prediction.generated_at, locale)}</dd></div>
          <div><dt className="text-text-secondary">{t('aiInsights.result.version')}</dt><dd className="mt-1 text-text-primary">{prediction.model_version}</dd></div>
        </dl>
        <p className="mt-3 text-body-2-regular text-text-secondary">{t('aiInsights.result.reference')}</p>
      </details>
    </AppPanel>
  );
}
