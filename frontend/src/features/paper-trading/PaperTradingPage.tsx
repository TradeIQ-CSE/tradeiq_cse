import { useTranslation } from "react-i18next";
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RiHistoryLine } from "@remixicon/react";
import { ButtonLink } from "../../components/base/buttons/button";
import {
  AppPage,
  PageIntro,
} from "../../components/application/layout/application-layout";
import { InfoTip } from "../../components/domain/info-tip";
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
          <>
            <div className="flex items-center gap-1">
              <SegmentedControl aria-label={t('paperTrading.workflow.label')}
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
              <InfoTip label={`${t('paperTrading.workflow.simple')} and ${t('paperTrading.workflow.advanced')}`}>
                {t('paperTrading.workflow.simpleHelp')}
              </InfoTip>
            </div>
            <ButtonLink
              href="/orders"
              variant="secondary"
              leadingIcon={RiHistoryLine}
            >
              {t("paperTrading.page.viewOrders")}
            </ButtonLink>
          </>
        }
      />

      <PortfolioScope mode={mode} busy={busy} onBusyChange={setBusy}
        creationDefaults={{ name: t('paperTrading.page.defaultPortfolioName'), startingCapital: DEFAULT_PRACTICE_CAPITAL }}>
        {(portfolioId) => <OrderTicket portfolioId={portfolioId} mode={mode} onBusyChange={setBusy} initialSymbol={params.get('symbol') ?? undefined} />}
      </PortfolioScope>
    </AppPage>
  );
}
