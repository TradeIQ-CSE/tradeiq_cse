import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RiLineChartLine } from '@remixicon/react';
import {
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
} from '../../components/application/layout/application-layout';
import { Button } from '../../components/base/buttons/button';

export function Watchlist() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('watchlistPage.eyebrow')}
        title={t('watchlistPage.title')}
        description={t('watchlistPage.description')}
      />

      <AppPanel className="p-0 sm:p-0">
        <PageState
          className="min-h-[22rem] border-0 bg-transparent"
          kind="empty"
          title={t('watchlistPage.emptyTitle')}
          description={t('watchlistPage.emptyDescription')}
          action={
            <Button leadingIcon={RiLineChartLine} onClick={() => navigate('/markets')}>
              {t('watchlistPage.browse')}
            </Button>
          }
        />
      </AppPanel>
    </AppPage>
  );
}

export default Watchlist;
