import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import { readErrorText } from "./error-text";
import { localeFor } from "../../i18n";
import { formatMoney, formatQuantity, formatSignedMoney } from "./format";
import { useCashTransactions } from "./usePortfolios";
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  Pager,
  SkeletonRow,
  StateMessage,
} from "./ui";
import { financialToneClass } from "../../components/application/financial-data";

interface CashLedgerProps {
  portfolioId: string;
}

const COLUMN_COUNT = 4;

export function CashLedger({ portfolioId }: CashLedgerProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [page, setPage] = useState(1);

  // This component isn't remounted when the selector switches portfolios
  // (see usePortfolios.ts's useCashTransactions), so `page` would otherwise
  // survive the switch: a request for portfolio B's page 3 can come back
  // with a smaller `meta.total`, leaving the footer reading "Page 3 of 1".
  useEffect(() => {
    setPage(1);
  }, [portfolioId]);

  const { data, isPending, isFetching, isError, error } = useCashTransactions(
    portfolioId,
    page,
  );

  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.page_size || 1;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.data ?? [];

  if (isError) {
    if (
      error instanceof ApiError &&
      error.body.code === "PORTFOLIO_NOT_FOUND"
    ) {
      // The parent's canary (PortfolioScope) is already recovering from this
      // same 404 — render nothing rather than flash the raw backend message
      // before the parent unmounts this component.
      return null;
    }
    return (
      <ErrorCard>
        {readErrorText(error, t("portfolio.cashLedger.unreachable"))}
      </ErrorCard>
    );
  }

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t("portfolio.cashLedger.loading")} />}

      <CardHeading title={t("portfolio.cashLedger.title")} />

      {!isPending && rows.length === 0 ? (
        <StateMessage>{t("portfolio.cashLedger.empty")}</StateMessage>
      ) : (
        <div>
          <p className="border-y border-separator-border px-4 py-2 text-body-2-regular text-text-tertiary sm:hidden">
            {t("portfolio.cashLedger.scrollHint")}
          </p>
          <div className="overflow-x-auto">
            <table className="bui-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">{t("portfolio.cashLedger.columns.type")}</th>
                  <th scope="col" className="text-right">
                    {t("portfolio.cashLedger.columns.amount")}
                  </th>
                  <th scope="col" className="text-right">
                    {t("portfolio.cashLedger.columns.balanceAfter")}
                  </th>
                  <th scope="col">
                    {t("portfolio.cashLedger.columns.effectiveDate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPending && !data
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonRow columns={COLUMN_COUNT} key={index} />
                    ))
                  : rows.map((transaction) => (
                      <tr key={transaction.transaction_id}>
                        <td>
                          {t(`portfolio.cashLedger.types.${transaction.type}`)}
                        </td>
                        <td
                          className={`text-right tabular-nums ${financialToneClass(transaction.amount)}`}
                        >
                          {formatSignedMoney(transaction.amount, locale)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatMoney(transaction.balance_after, locale)}
                        </td>
                        <td className="tabular-nums">
                          {transaction.effective_date}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isError && total > 0 && (
        <Pager
          label={t("portfolio.cashLedger.pagination.page", {
            page: formatQuantity(page, locale),
            lastPage: formatQuantity(lastPage, locale),
          })}
          previousLabel={t("portfolio.cashLedger.pagination.previous")}
          nextLabel={t("portfolio.cashLedger.pagination.next")}
          canGoPrevious={page > 1}
          canGoNext={page < lastPage}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </Card>
  );
}
