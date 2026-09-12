import { useTranslation } from 'react-i18next';
import {
  RiDatabase2Line,
  RiPulseLine,
  RiShieldCheckLine,
  RiShieldUserLine,
} from '@remixicon/react';
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
} from '../../components/application/layout/application-layout';
import { Button } from '../../components/base/buttons/button';

const ADMIN_CAPABILITIES = [
  { key: 'data', icon: RiDatabase2Line },
  { key: 'access', icon: RiShieldCheckLine },
  { key: 'diagnostics', icon: RiPulseLine },
] as const;

export function AdminHome() {
  const { t } = useTranslation();

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('adminPage.eyebrow')}
        title={t('adminPage.title')}
        description={t('adminPage.description')}
      />

      <AppNotice tone="warning" title={t('adminPage.noticeTitle')}>
        {t('adminPage.notice')}
      </AppNotice>

      <AppPanel className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="flex shrink-0 rounded-2xl bg-stat-card-icon-background p-2.5">
            <RiShieldUserLine className="size-5 text-foreground-icon-primary" aria-hidden />
          </span>
          <div>
            <h2 className="text-title-2-medium text-text-primary">
              {t('adminPage.operationsTitle')}
            </h2>
            <p className="mt-1 max-w-2xl text-body-regular text-text-secondary">
              {t('adminPage.operationsDescription')}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {ADMIN_CAPABILITIES.map(({ key, icon: Icon }) => (
            <article
              key={key}
              className="flex min-w-0 flex-col rounded-2xl border border-border-button-default bg-background-secondary-default p-4"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-background-tertiary-default">
                <Icon className="size-5 text-foreground-icon-secondary" aria-hidden />
              </span>
              <h3 className="mt-3 text-headline-medium text-text-primary">
                {t(`adminPage.capabilities.${key}.title`)}
              </h3>
              <p className="mt-1 flex-1 text-body-2-regular text-text-secondary">
                {t(`adminPage.capabilities.${key}.description`)}
              </p>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                size="small"
                leadingIcon={Icon}
                disabled
              >
                {t(`adminPage.capabilities.${key}.action`)}
              </Button>
            </article>
          ))}
        </div>
      </AppPanel>

      <AppPanel tone="subtle" className="flex items-start gap-3">
        <RiShieldCheckLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div>
          <h2 className="text-headline-medium text-text-primary">
            {t('adminPage.accessTitle')}
          </h2>
          <p className="mt-1 text-body-regular text-text-secondary">
            {t('adminPage.accessDescription')}
          </p>
        </div>
      </AppPanel>
    </AppPage>
  );
}

export default AdminHome;
