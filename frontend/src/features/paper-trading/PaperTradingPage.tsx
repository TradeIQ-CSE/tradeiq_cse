import { useTranslation } from "react-i18next";
import { RiHistoryLine } from "@remixicon/react";
import { ButtonLink } from "../../components/base/buttons/button";
import {
  AppPage,
  AppNotice,
  PageIntro,
} from "../../components/application/layout/application-layout";
import { OrderTicket } from "./OrderTicket";
import { PortfolioScope } from "./PortfolioScope";

// No AppShell here: AppRoutes' ConsoleShellLayout already wraps every console
// page in one, and mounting a second would nest the sidebar inside itself —
// same reasoning as PortfolioPage.tsx. PortfolioScope is the first child,
// exactly as it is on the portfolio overview page, so portfolio selection and
// creation behave identically everywhere they appear.
export function PaperTradingPage() {
  const { t } = useTranslation();

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

      <PortfolioScope>
        {(portfolioId) => <OrderTicket portfolioId={portfolioId} />}
      </PortfolioScope>
    </AppPage>
  );
}
