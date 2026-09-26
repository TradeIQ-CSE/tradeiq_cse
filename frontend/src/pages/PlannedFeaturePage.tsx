import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RiArrowRightLine } from '@remixicon/react';
import {
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
} from '../components/application/layout/application-layout';
import { Button } from '../components/base/buttons/button';

export type PlannedFeatureKey = 'aiInsights' | 'reports';

const alternatives: Record<PlannedFeatureKey, string> = {
  aiInsights: '/backtests/new',
  reports: '/orders',
};

/**
 * One layout for every feature that isn't built yet: say what it will do,
 * then point at what works today.
 * No placeholder figures are ever shown.
 */
export function PlannedFeaturePage({ feature }: { feature: PlannedFeatureKey }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefix = `plannedFeatures.${feature}`;

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t(`${prefix}.eyebrow`)}
        title={t(`${prefix}.title`)}
        description={t(`${prefix}.description`)}
      />

      <AppPanel className="p-0 sm:p-0">
        <PageState
          className="min-h-[22rem] border-0 bg-transparent"
          kind="empty"
          title={t('plannedFeatures.comingSoon')}
          description={t(`${prefix}.meanwhile`)}
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
    </AppPage>
  );
}

export default PlannedFeaturePage;
