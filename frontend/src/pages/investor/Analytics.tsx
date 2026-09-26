import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppPage, PageIntro } from '../../components/application/layout/application-layout';
import { Switch } from '../../components/base/switch/switch';
import { BacktestsCard } from '../../features/analytics/BacktestsCard';
import { PerformanceCard } from '../../features/analytics/PerformanceCard';

const DETAIL_KEY = 'tradeiq.analytics.detail';

function readDetail(): boolean {
  try {
    return window.localStorage.getItem(DETAIL_KEY) === 'on';
  } catch {
    return false;
  }
}

export function Analytics() {
  const { t } = useTranslation();
  // Simple by default; the choice is remembered on this device.
  const [detail, setDetail] = useState(readDetail);

  function changeDetail(next: boolean) {
    setDetail(next);
    try {
      window.localStorage.setItem(DETAIL_KEY, next ? 'on' : 'off');
    } catch {
      // Private mode or blocked storage: the switch still works for this visit.
    }
  }

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('analyticsPage.eyebrow')}
        title={t('analyticsPage.title')}
        description={t('analyticsPage.description')}
        actions={
          <Switch isSelected={detail} onChange={changeDetail}>
            <span className="text-body-medium text-text-primary">{t('analyticsPage.detailToggle')}</span>
          </Switch>
        }
      />
      <PerformanceCard detail={detail} />
      <BacktestsCard detail={detail} />
    </AppPage>
  );
}

export default Analytics;
