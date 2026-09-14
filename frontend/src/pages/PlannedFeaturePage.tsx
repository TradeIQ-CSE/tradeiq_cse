import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RiArrowRightLine } from '@remixicon/react';
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
} from '../components/application/layout/application-layout';
import { Button } from '../components/base/buttons/button';

export type PlannedFeatureKey = 'aiInsights' | 'reports';

const alternatives: Record<PlannedFeatureKey, string> = {
  aiInsights: '/analytics',
  reports: '/portfolio',
};

export function PlannedFeaturePage({ feature }: { feature: PlannedFeatureKey }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefix = `plannedFeatures.${feature}`;

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('plannedFeatures.eyebrow')}
        title={t(`${prefix}.title`)}
        description={t(`${prefix}.description`)}
      />

      <AppPanel className="p-0 sm:p-0">
        <PageState
          className="min-h-[20rem] border-0 bg-transparent"
          kind="empty"
          title={t('plannedFeatures.unavailableTitle')}
          description={t(`${prefix}.unavailableDescription`)}
          action={
            <Button
              trailingIcon={RiArrowRightLine}
              onClick={() => navigate(alternatives[feature])}
            >
              {t(`${prefix}.alternative`)}
            </Button>
          }
        />
      </AppPanel>

      <AppNotice title={t('plannedFeatures.noticeTitle')}>
        {t('plannedFeatures.notice')}
      </AppNotice>
    </AppPage>
  );
}

export default PlannedFeaturePage;
