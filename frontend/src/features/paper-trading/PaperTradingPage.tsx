import { useTranslation } from "react-i18next";
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RiHistoryLine } from "@remixicon/react";
import { ButtonLink } from "../../components/base/buttons/button";
import {
  AppPage,
  AppNotice,
  PageIntro,
} from "../../components/application/layout/application-layout";
import { OrderTicket } from "./OrderTicket";
import { PortfolioScope } from "./PortfolioScope";
import { DEFAULT_PRACTICE_CAPITAL } from './defaults';
import { SegmentedControl, SegmentedControlItem } from '@/components/base/segmented-control/segmented-control';

// No AppShell here: AppRoutes' ConsoleShellLayout already wraps every console
// page in one, and mounting a second would nest the sidebar inside itself —
// same reasoning as PortfolioPage.tsx. PortfolioScope is the first child,
// exactly as it is on the portfolio overview page, so portfolio selection and
// creation behave identically everywhere they appear.
export function PaperTradingPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'advanced' ? 'advanced' : 'simple';
  const [busy, setBusy] = useState(false);

  return (
    <AppPage>
      <PageIntro
        eyebrow={t("paperTrading.page.eyebrow")}
        title={t("paperTrading.page.title")}
        description={t("paperTrading.page.subtitle")}
        actions={
          <ButtonLink
            href="/orders"
            variant="secondary"
            leadingIcon={RiHistoryLine}
          >
            {t("paperTrading.page.viewOrders")}
          </ButtonLink>
        }
      />

      <AppNotice title={t("paperTrading.page.noticeTitle")}>
        {t("paperTrading.page.notice")}
      </AppNotice>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-2-regular text-text-secondary">
          {t(`paperTrading.workflow.${mode}Help`)}
        </p>
        <SegmentedControl className="sm:shrink-0" aria-label={t('paperTrading.workflow.label')}
          selectedKeys={new Set([mode])} isDisabled={busy}
          onSelectionChange={(keys) => {
            const [next] = [...keys];
            if (!next || busy) return;
            const updated = new URLSearchParams(params);
            updated.set('mode', String(next));
            setParams(updated);
          }}>
          <SegmentedControlItem id="simple">{t('paperTrading.workflow.simple')}</SegmentedControlItem>
          <SegmentedControlItem id="advanced">{t('paperTrading.workflow.advanced')}</SegmentedControlItem>
        </SegmentedControl>
      </div>

      <PortfolioScope mode={mode} busy={busy} onBusyChange={setBusy}
        creationDefaults={{ name: t('paperTrading.page.defaultPortfolioName'), startingCapital: DEFAULT_PRACTICE_CAPITAL }}>
        {(portfolioId) => <OrderTicket portfolioId={portfolioId} mode={mode} onBusyChange={setBusy} />}
      </PortfolioScope>
    </AppPage>
  );
}
