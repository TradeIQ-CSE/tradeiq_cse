import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  RiArrowRightLine,
  RiBarChartGroupedLine,
  RiFlaskLine,
  RiHistoryLine,
  RiInformationLine,
} from '@remixicon/react';
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
} from '../../components/application/layout/application-layout';
import { Button } from '../../components/base/buttons/button';

const STEPS = [
  { key: 'security', icon: RiBarChartGroupedLine },
  { key: 'rules', icon: RiFlaskLine },
  { key: 'review', icon: RiHistoryLine },
] as const;

export function Analytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('analyticsPage.eyebrow')}
        title={t('analyticsPage.title')}
        description={t('analyticsPage.description')}
        actions={
          <Button leadingIcon={RiFlaskLine} onClick={() => navigate('/backtests/new/security')}>
            {t('analyticsPage.start')}
          </Button>
        }
      />

      <AppNotice title={t('analyticsPage.noticeTitle')}>
        {t('analyticsPage.notice')}
      </AppNotice>

      <AppPanel className="flex flex-col gap-5">
        <div>
          <p className="text-caption-1-semibold text-status-blue-text">{t('analyticsPage.guideEyebrow')}</p>
          <h2 className="mt-1 text-title-2-medium text-text-primary">{t('analyticsPage.guideTitle')}</h2>
          <p className="mt-1 max-w-2xl text-body-regular text-text-secondary">
            {t('analyticsPage.guideDescription')}
          </p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <li key={key} className="rounded-2xl border border-border-button-default bg-background-secondary-default p-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-stat-card-icon-background text-foreground-icon-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-caption-1-semibold text-text-tertiary">
                {t('analyticsPage.step', { number: index + 1 })}
              </p>
              <h3 className="mt-0.5 text-headline-medium text-text-primary">
                {t(`analyticsPage.steps.${key}.title`)}
              </h3>
              <p className="mt-1 text-body-2-regular text-text-secondary">
                {t(`analyticsPage.steps.${key}.description`)}
              </p>
            </li>
          ))}
        </ol>

        <Button className="self-start" trailingIcon={RiArrowRightLine} onClick={() => navigate('/backtests/new/security')}>
          {t('analyticsPage.openWizard')}
        </Button>
      </AppPanel>

      <AppPanel tone="subtle" className="flex items-start gap-3">
        <RiInformationLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div>
          <h2 className="text-headline-medium text-text-primary">{t('analyticsPage.plannedTitle')}</h2>
          <p className="mt-1 text-body-regular text-text-secondary">{t('analyticsPage.plannedDescription')}</p>
        </div>
      </AppPanel>
    </AppPage>
  );
}

export default Analytics;
