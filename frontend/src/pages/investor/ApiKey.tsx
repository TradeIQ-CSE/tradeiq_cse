import { useTranslation } from 'react-i18next';
import { AppPage, PageIntro } from '../../components/application/layout/application-layout';
import { DeveloperApiCard } from '../../features/developer-api/DeveloperApiCard';

export function ApiKey() {
  const { t } = useTranslation();

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('apiKeyPage.eyebrow')}
        title={t('apiKeyPage.title')}
        description={t('apiKeyPage.description')}
      />

      <DeveloperApiCard />
    </AppPage>
  );
}

export default ApiKey;
