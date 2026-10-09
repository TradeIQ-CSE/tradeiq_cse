import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RiRefreshLine } from '@remixicon/react';
import { AppNotice, AppPage, AppPanel, PageIntro, PageState } from '../../components/application/layout/application-layout';
import { Button, ButtonLink } from '../../components/base/buttons/button';
import { CompanySearch } from '../markets/CompanySearch';
import { SecuritySectorIcon } from '../markets/SecuritySectorIcon';
import { useSecurityDetail } from '../markets/useSecurityDetail';
import { ApiError } from '../../lib/api';
import { localeFor } from '../../i18n';
import { formatFraction } from './format';
import { useConfigurations, usePrediction, usePredictionStatus } from './usePredictions';
import { SetupControls } from './SetupControls';
import { PredictionResult } from './PredictionResult';

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,29}$/;

export function AiInsightsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [params, setParams] = useSearchParams();
  const rawSymbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  const symbol = SYMBOL_PATTERN.test(rawSymbol) ? rawSymbol : '';
  // Typing a search is separate from choosing an API-backed company.
  const [draft, setDraft] = useState<string | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [changeSetup, setChangeSetup] = useState(false);
  const setupId = useId();
  const catalog = useConfigurations();
  const status = usePredictionStatus();
  const company = useSecurityDetail(symbol);
  const setups = catalog.data?.configurations ?? [];
  const setup = setups.find((item) => item.config_key === (setupKey ?? catalog.data?.default_config_key))
    ?? setups.find((item) => item.config_key === catalog.data?.default_config_key) ?? setups[0];
  const companyMatches = company.data?.symbol === symbol;
  const result = usePrediction(companyMatches ? symbol : '', setup?.config_key);
  const response = result.data;
  const prediction = response?.symbol === symbol && response.config_key === setup?.config_key
    && response.prediction?.symbol === symbol && response.prediction.configuration.config_key === setup?.config_key
    ? response.prediction : null;
  const busy = catalog.isFetching || status.isFetching || (!!symbol && company.isFetching) || result.isFetching;
  const latestRun = status.data?.latest_run;
  const notFound = company.error instanceof ApiError && company.error.body.code === 'SECURITY_NOT_FOUND';

  function chooseCompany(next: string) {
    setDraft(null);
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set('symbol', next);
      return updated;
    });
  }

  function editSearch(value: string) {
    setDraft(value);
    if (value !== rawSymbol) {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        updated.delete('symbol');
        return updated;
      }, { replace: true });
    }
  }

  function refreshResults() {
    void catalog.refetch();
    void status.refetch();
    if (symbol) void company.refetch();
    if (companyMatches && setup) void result.refetch();
  }

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('nav.items.aiInsights')}
        title={t('aiInsights.title')}
        description={t('aiInsights.description')}
        actions={<Button variant="secondary" leadingIcon={RiRefreshLine} disabled={busy} onClick={refreshResults}>{t('aiInsights.refresh')}</Button>}
      />

      {latestRun?.status === 'running' && <AppNotice title={t('aiInsights.updating.title')}>{t('aiInsights.updating.description')}</AppNotice>}
      {latestRun?.status === 'failed' && <AppNotice tone="warning" title={t('aiInsights.updateFailed.title')}>{t('aiInsights.updateFailed.description')}</AppNotice>}

      <AppPanel className="flex flex-col gap-4">
        <CompanySearch label={t('aiInsights.company')} value={rawSymbol || draft || ''} onChange={editSearch} onSelect={(item) => chooseCompany(item.symbol)} />
        {companyMatches && company.data && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4">
            <div className="flex min-w-0 items-center gap-3">
              <SecuritySectorIcon sector={company.data.sector} />
              <div className="min-w-0">
                <p className="text-body-medium text-text-primary">{symbol}</p>
                <p className="break-words text-body-2-regular text-text-secondary">{company.data.company_name}</p>
              </div>
            </div>
            <ButtonLink href={`/markets/${encodeURIComponent(symbol)}`} variant="secondary" size="small">{t('aiInsights.viewCompany')}</ButtonLink>
          </div>
        )}
        {setup && (
          <div className="flex flex-col gap-4 border-t border-separator-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-body-medium text-text-primary">{t('aiInsights.setup.title')}</h2>
                <p className="mt-1 text-body-2-regular text-text-secondary">{t('aiInsights.setup.summary', {
                  target: formatFraction(setup.take_profit_pct, locale), loss: formatFraction(setup.stop_loss_pct, locale), count: setup.horizon_bars,
                })}</p>
              </div>
              <Button variant="secondary" size="small" aria-expanded={changeSetup} aria-controls={setupId} onClick={() => setChangeSetup((current) => !current)}>
                {t(changeSetup ? 'aiInsights.setup.close' : 'aiInsights.setup.change')}
              </Button>
            </div>
            {changeSetup && <div id={setupId}><SetupControls catalog={setups} setup={setup} onChange={setSetupKey} locale={locale} /></div>}
          </div>
        )}
      </AppPanel>

      {catalog.isError && catalog.data && <AppNotice tone="warning">{t('aiInsights.states.catalogRefreshError')}</AppNotice>}
      {status.isError && <AppNotice tone="warning">{t('aiInsights.states.statusError')}</AppNotice>}
      {company.isError && companyMatches && <AppNotice tone="warning">{t('aiInsights.states.companyRefreshError')}</AppNotice>}
      {result.isError && prediction && <AppNotice tone="warning">{t('aiInsights.states.resultRefreshError')}</AppNotice>}

      {!catalog.data ? (
        <PageState kind={catalog.isError ? 'error' : 'loading'} title={t(catalog.isError ? 'aiInsights.states.catalogError' : 'aiInsights.states.loading')}
          action={catalog.isError ? <Button variant="secondary" onClick={() => void catalog.refetch()}>{t('aiInsights.retry')}</Button> : undefined} />
      ) : setups.length === 0 ? (
        <PageState kind="empty" title={t('aiInsights.states.noBatch')} description={t('aiInsights.states.noBatchDescription')} />
      ) : !symbol ? (
        <PageState kind="empty" title={t(rawSymbol ? 'aiInsights.states.invalidCompany' : 'aiInsights.states.choose')}
          description={t('aiInsights.states.chooseDescription')} />
      ) : company.isError && !companyMatches ? (
        <PageState kind={notFound ? 'empty' : 'error'} title={t(notFound ? 'aiInsights.states.invalidCompany' : 'aiInsights.states.companyError')}
          description={notFound ? t('aiInsights.states.chooseDescription') : undefined}
          action={!notFound ? <Button variant="secondary" onClick={() => void company.refetch()}>{t('aiInsights.retry')}</Button> : undefined} />
      ) : !companyMatches || result.isPending ? (
        <PageState kind="loading" title={t('aiInsights.states.loading')} />
      ) : prediction ? (
        <div aria-busy={result.isFetching}>
          {result.isFetching && <p role="status" className="mb-2 text-body-2-regular text-text-secondary">{t('aiInsights.states.refreshing')}</p>}
          <PredictionResult prediction={prediction} latestPriceDate={company.data?.data_to} locale={locale} />
        </div>
      ) : result.isError ? (
        <PageState kind="error" title={t('aiInsights.states.resultError')} description={t('aiInsights.states.resultErrorDescription')}
          action={<Button variant="secondary" onClick={() => void result.refetch()}>{t('aiInsights.retry')}</Button>} />
      ) : (
        <PageState kind="empty" title={t(response?.availability === 'no_completed_batch' ? 'aiInsights.states.noBatch' : 'aiInsights.states.noPrediction')}
          description={t(response?.availability === 'no_completed_batch' ? 'aiInsights.states.noBatchDescription' : 'aiInsights.states.noPredictionDescription')} />
      )}
    </AppPage>
  );
}
