import { useTranslation } from "react-i18next";
import { RiAddLine } from "@remixicon/react";
import { ButtonLink } from "../../components/base/buttons/button";
import {
  AppPage,
  PageIntro,
} from "../../components/application/layout/application-layout";
import { OrdersTable } from "./OrdersTable";
import { PortfolioScope } from "./PortfolioScope";

// No AppShell here: AppRoutes' ConsoleShellLayout already wraps every console
// page in it, same as PortfolioPage.tsx — mounting a second one would nest the
// sidebar inside itself.
export function OrdersPage() {
  const { t } = useTranslation();

  return (
    <AppPage>
      <PageIntro
        eyebrow={t("orders.page.eyebrow")}
        title={t("orders.page.title")}
        description={t("orders.page.subtitle")}
        actions={
          <ButtonLink href="/paper-trading" leadingIcon={RiAddLine}>
            {t("orders.page.placeTrade")}
          </ButtonLink>
        }
      />

      <PortfolioScope>
        {(portfolioId) => <OrdersTable portfolioId={portfolioId} />}
      </PortfolioScope>
    </AppPage>
  );
}
