import { useState } from "react";
import { useTranslation } from "react-i18next";
import { parseDate } from "@internationalized/date";
import { RiArrowRightLine } from "@remixicon/react";
import { ButtonLink } from "../../components/base/buttons/button";
import { DatePicker } from "../../components/base/date-picker/date-picker";
import {
  AppPage,
  PageIntro,
} from "../../components/application/layout/application-layout";
import { CashLedger } from "./CashLedger";
import { PortfolioScope } from "./PortfolioScope";
import { PositionsTable } from "./PositionsTable";
import { SummaryCards } from "./SummaryCards";
import { useTradingDateBounds } from "./useTradingDateBounds";

export function PortfolioPage() {
  const { t } = useTranslation();
  // Empty string means "latest available session", mirroring
  // MarketsPage.tsx's trading-date control and useSecurities' `|| undefined`
  // normalization — an empty as_of must never reach the API as `?as_of=`.
  const [selectedAsOf, setSelectedAsOf] = useState<string>("");
  const { availableFrom, availableTo } = useTradingDateBounds();

  // No AppShell here: AppRoutes' ConsoleShellLayout already wraps every
  // console page in it, and mounting a second one would nest the sidebar
  // inside itself.
  const displayedDate = selectedAsOf || availableTo || "";

  return (
    <AppPage>
      <PageIntro
        eyebrow={t("portfolio.eyebrow")}
        title={t("portfolio.title")}
        description={t("portfolio.subtitle")}
        actions={
          <ButtonLink href="/paper-trading" trailingIcon={RiArrowRightLine}>
            {t("portfolio.practiceTrade")}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
        <span className="text-body-2-medium text-text-secondary">
          {t("portfolio.asOfLabel")}
        </span>
        <DatePicker
          aria-label={t("portfolio.asOfLabel")}
          value={displayedDate ? parseDate(displayedDate) : null}
          minValue={availableFrom ? parseDate(availableFrom) : undefined}
          maxValue={availableTo ? parseDate(availableTo) : undefined}
          onChange={(value) => value && setSelectedAsOf(value.toString())}
        />
        <span className="max-w-sm text-right text-caption-1-medium text-text-tertiary">
          {t("portfolio.asOfHelp")}
        </span>
      </div>

      <PortfolioScope>
        {(portfolioId) => (
          <>
            <SummaryCards
              portfolioId={portfolioId}
              asOf={selectedAsOf || undefined}
            />
            <PositionsTable
              portfolioId={portfolioId}
              asOf={selectedAsOf || undefined}
            />
            <CashLedger portfolioId={portfolioId} />
          </>
        )}
      </PortfolioScope>
    </AppPage>
  );
}
