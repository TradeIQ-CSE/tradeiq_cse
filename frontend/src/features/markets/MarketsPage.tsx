import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  RiCalendarLine,
  RiLineChartLine,
  RiStarFill,
  RiStarLine,
} from "@remixicon/react";
import { parseDate } from "@internationalized/date";
import { Button } from "../../components/base/buttons/button";
import { Chip } from "../../components/base/badges/chip";
import { DatePicker } from "../../components/base/date-picker/date-picker";
import { Pagination } from "../../components/base/pagination/pagination";
import { Select, SelectItem } from "../../components/base/select/select";
import {
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
  PageToolbar,
  StatSurface,
} from "../../components/application/layout/application-layout";
import { ChevronUpDownSmall } from "../../components/foundations/icons/chevrons";
import { useTopbarSearch } from "../../components/layout/useTopbarSearch";
import { ApiError } from "../../lib/api";
import { localeFor } from "../../i18n";
import { SecuritiesSort } from "./types";
import { useSecurities } from "./useSecurities";
import { useSectorOptions } from "./useSectorOptions";
import { TopMovers } from "./TopMovers";
import { SecuritySectorIcon } from "./SecuritySectorIcon";
import {
  formatCount,
  formatPrice,
  formatSigned,
  formatVolume,
  marketCapBand,
} from "./format";

const PAGE_SIZE = 20;

export function MarketsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [securitySort, setSecuritySort] = useState<SecuritiesSort>("symbol");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedTradingDate, setSelectedTradingDate] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());

  const { data: sectorOptions } = useSectorOptions();

  const { data, isPending, isFetching, isError, error } = useSecurities({
    search: searchQuery.trim(),
    sector: selectedSector,
    as_of: selectedTradingDate,
    sort: securitySort,
    page: currentPage,
    page_size: PAGE_SIZE,
  });

  const total = data?.meta?.total ?? 0;
  // Server-echoed date the rows are priced at. Every row on the page shares it,
  // so it is stated once here rather than per row.
  const resolvedAsOf = data?.meta?.as_of ?? "";
  const availableFrom = data?.meta?.available_from ?? undefined;
  const availableTo = data?.meta?.available_to ?? undefined;
  const tradingDate = selectedTradingDate || resolvedAsOf;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dash = t("markets.empty");
  const pageDescription = [
    `${t("markets.subtitle", {
      count: total,
      formattedCount: formatCount(total, locale),
    })}.`,
    resolvedAsOf ? t("markets.asOfDescription", { date: resolvedAsOf }) : null,
    t("markets.notice.eod"),
  ]
    .filter(Boolean)
    .join(" ");

  function toggleWatch(symbol: string) {
    setWatchedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function toggleSort(next: SecuritiesSort) {
    setSecuritySort(next);
    setCurrentPage(1);
  }

  useTopbarSearch(searchQuery, (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  });

  return (
    <AppPage>
      <PageIntro
        eyebrow={t("markets.eyebrow")}
        title={t("markets.title")}
        description={pageDescription}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatSurface
          icon={RiLineChartLine}
          label={t("markets.stats.listed")}
          value={formatCount(total, locale)}
          supportingText={t("markets.stats.listedHelp")}
        />
        <StatSurface
          icon={RiCalendarLine}
          label={t("markets.stats.asOf")}
          value={resolvedAsOf || dash}
          supportingText={t("markets.stats.asOfHelp")}
        />
      </div>

      <TopMovers asOf={selectedTradingDate} sector={selectedSector} />

      <PageToolbar aria-label={t("markets.filters.label")}>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-72">
          <span className="text-body-2-medium text-text-secondary">
            {t("markets.filters.sector")}
          </span>
          <Select
            aria-label={t("markets.filters.selectSegment")}
            className="w-full"
            selectedKey={selectedSector || "all"}
            onSelectionChange={(key) => {
              setSelectedSector(key === "all" ? "" : String(key));
              setCurrentPage(1);
            }}
          >
            <SelectItem id="all" textValue={t("markets.filters.allSectors")}>
              {t("markets.filters.allSectors")}
            </SelectItem>
            {sectorOptions?.map((sector) => (
              <SelectItem
                key={sector.gics_code}
                id={sector.gics_code}
                textValue={sector.name}
              >
                {sector.name}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div
          className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-56"
          title={t("markets.unavailable.marketCap")}
        >
          <span className="text-body-2-medium text-text-secondary">
            {t("markets.filters.marketCap")}
          </span>
          <Select
            aria-label={t("markets.filters.selectMarketCap")}
            className="w-full"
            selectedKey="unavailable"
            isDisabled
          >
            <SelectItem
              id="unavailable"
              textValue={t("markets.filters.selectMarketCap")}
            >
              {t("markets.filters.selectMarketCap")}
            </SelectItem>
          </Select>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:ml-auto sm:max-w-56 sm:items-end">
          <span className="text-body-2-medium text-text-secondary">
            {t("markets.tradingDate")}
          </span>
          <DatePicker
            aria-label={t("markets.tradingDate")}
            className="w-full sm:w-auto"
            value={tradingDate ? parseDate(tradingDate) : null}
            minValue={availableFrom ? parseDate(availableFrom) : undefined}
            maxValue={availableTo ? parseDate(availableTo) : undefined}
            onChange={(value) => {
              if (!value) return;
              setSelectedTradingDate(value.toString());
              setCurrentPage(1);
            }}
          />
        </div>
      </PageToolbar>

      <AppPanel className="relative overflow-hidden p-0" aria-busy={isFetching}>
        {isFetching && (
          <span
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-button-primary"
            role="status"
            aria-label={t("markets.states.loading")}
          />
        )}
        {isError ? (
          <PageState
            kind="error"
            className="m-4 min-h-56 border-0 bg-background-secondary-default"
            title={t("markets.states.errorTitle")}
            description={
              error instanceof ApiError
                ? error.body.message
                : t("markets.states.unreachable")
            }
          />
        ) : !isPending && data && data.data.length === 0 ? (
          <PageState
            kind="empty"
            className="m-4 min-h-56 border-0 bg-background-secondary-default"
            title={t("markets.states.emptyTitle")}
            description={t("markets.states.empty")}
          />
        ) : (
          <div>
            <p className="border-b border-separator-border px-4 py-2 text-body-2-regular text-text-tertiary sm:hidden">
              {t("markets.table.scrollHint")}
            </p>
            <div className="overflow-x-auto">
              <table
                className="bui-table market-securities-table min-w-[960px]"
                aria-label={t("markets.title")}
              >
                <thead>
                  <tr>
                    <th scope="col">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-body-medium text-text-tertiary"
                        onClick={() => toggleSort("symbol")}
                        aria-current={securitySort === "symbol"}
                      >
                        {t("markets.columns.symbol")}
                        <ChevronUpDownSmall className="size-4 text-foreground-icon-secondary" />
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-body-medium text-text-tertiary"
                        onClick={() => toggleSort("company_name")}
                        aria-current={securitySort === "company_name"}
                      >
                        {t("markets.columns.sector")}
                        <ChevronUpDownSmall className="size-4 text-foreground-icon-secondary" />
                      </button>
                    </th>
                    <th scope="col">{t("markets.columns.cap")}</th>
                    <th scope="col" className="market-numeric-heading">
                      {t("markets.columns.price")}
                    </th>
                    <th scope="col" className="market-numeric-heading">
                      {t("markets.columns.change")}
                    </th>
                    <th scope="col" className="market-numeric-heading">
                      {t("markets.columns.changePct")}
                    </th>
                    <th scope="col" className="market-numeric-heading">
                      {t("markets.columns.volume")}
                    </th>
                    <th scope="col" className="market-numeric-heading">
                      {t("markets.columns.peRatio")}
                    </th>
                    <th scope="col" className="market-watch-heading">
                      {t("markets.columns.watch")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isPending && !data
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={9}>
                            <div className="h-5 w-full animate-pulse rounded bg-background-tertiary-default" />
                          </td>
                        </tr>
                      ))
                    : data?.data.map((security) => {
                        const band = marketCapBand(
                          security.shares_outstanding,
                          security.price,
                        );
                        const positive = (security.change ?? 0) >= 0;
                        const isWatched = watchedSymbols.has(security.symbol);
                        return (
                          <tr key={security.symbol}>
                            <td>
                              <div className="flex min-w-0 items-center gap-3">
                                <SecuritySectorIcon sector={security.sector} />
                                <Link
                                  to={`/markets/${encodeURIComponent(security.symbol)}`}
                                  aria-label={t("markets.viewDetails", {
                                    symbol: security.symbol,
                                  })}
                                  className="flex min-w-0 flex-col hover:underline"
                                >
                                  <span className="text-body-medium text-text-primary">
                                    {security.symbol}
                                  </span>
                                  <span className="max-w-52 truncate text-body-2-medium text-text-tertiary">
                                    {security.company_name}
                                  </span>
                                </Link>
                              </div>
                            </td>
                            <td>
                              {security.sector ? (
                                <Chip variant="subtle" color="soft">
                                  {security.sector.name}
                                </Chip>
                              ) : (
                                dash
                              )}
                            </td>
                            <td>
                              {band ? (
                                <Chip variant="subtle" color="neutral">
                                  {t(`markets.cap.${band}`)}
                                </Chip>
                              ) : (
                                dash
                              )}
                            </td>
                            <td className="text-right tabular-nums">
                              {security.price !== null
                                ? formatPrice(security.price, locale)
                                : dash}
                            </td>
                            <td className="text-right tabular-nums">
                              {security.change !== null ? (
                                <Chip
                                  variant="bold"
                                  color={positive ? "lime" : "rose"}
                                >
                                  {formatSigned(security.change, 2, locale)}
                                </Chip>
                              ) : (
                                dash
                              )}
                            </td>
                            <td className="text-right tabular-nums">
                              {security.change_pct !== null ? (
                                <Chip
                                  variant="bold"
                                  color={positive ? "lime" : "rose"}
                                >
                                  {`${formatSigned(security.change_pct, 2, locale)}%`}
                                </Chip>
                              ) : (
                                dash
                              )}
                            </td>
                            <td className="text-right tabular-nums">
                              {security.volume !== null
                                ? formatVolume(security.volume, locale)
                                : dash}
                            </td>
                            <td className="text-right tabular-nums">
                              {security.pe_ratio !== null
                                ? formatPrice(security.pe_ratio, locale)
                                : dash}
                            </td>
                            <td className="market-watch-cell">
                              <Button
                                variant="secondary"
                                size="small"
                                iconOnly
                                leadingIcon={
                                  isWatched ? RiStarFill : RiStarLine
                                }
                                onClick={() => toggleWatch(security.symbol)}
                                aria-pressed={isWatched}
                                aria-label={t(
                                  isWatched
                                    ? "markets.watch.remove"
                                    : "markets.watch.add",
                                )}
                                title={t(
                                  isWatched
                                    ? "markets.watch.remove"
                                    : "markets.watch.add",
                                )}
                                className={
                                  isWatched
                                    ? "border-status-yellow-text text-status-yellow-text"
                                    : undefined
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AppPanel>

      {!isError && total > 0 && (
        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-body-medium text-text-secondary">
            {t("markets.pagination.page", {
              page: formatCount(currentPage, locale),
              lastPage: formatCount(lastPage, locale),
            })}
          </span>
          <Pagination
            page={currentPage}
            totalPages={lastPage}
            onChange={setCurrentPage}
            className="sm:max-w-xl"
          />
        </footer>
      )}
    </AppPage>
  );
}
