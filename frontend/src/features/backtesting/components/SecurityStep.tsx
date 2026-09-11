import { useEffect, useMemo, useState } from "react";
import {
  RiCheckboxCircleLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import { SecuritySectorIcon } from "@/features/markets/SecuritySectorIcon";
import { formatPrice } from "@/features/markets/format";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { getSecuritiesUniverse } from "../api/backtestApi";
import type { SecurityListItem } from "../../markets/types";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

export function SecurityStep() {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const symbolError = getStepErrors("security").find(
    (error) => error.field === "symbol",
  );
  const [search, setSearch] = useState("");
  const [securities, setSecurities] = useState<SecurityListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setLoadError(null);
      getSecuritiesUniverse(search)
        .then((data) => {
          if (!isCurrent) return;
          setSecurities(data);
          setIsLoading(false);
        })
        .catch(() => {
          if (!isCurrent) return;
          setSecurities([]);
          setLoadError("CSE securities could not be loaded right now.");
          setIsLoading(false);
        });
    }, 200);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [requestVersion, search]);

  const selectedSector = useMemo(() => {
    if (!config.security.sector) return null;
    return {
      name: config.security.sector,
      gics_code: config.security.sectorGicsCode ?? "",
    };
  }, [config.security.sector, config.security.sectorGicsCode]);

  const handleSelectSecurity = (security: SecurityListItem) => {
    updateConfig((previous) => {
      let startDate = previous.period.startDate;
      let endDate = previous.period.endDate;

      if (security.data_from && startDate < security.data_from) {
        startDate = security.data_from;
      }
      if (security.data_to && endDate > security.data_to) {
        endDate = security.data_to;
      }
      if (startDate > endDate) {
        startDate = security.data_from ?? previous.period.startDate;
        endDate = security.data_to ?? previous.period.endDate;
      }

      return {
        ...previous,
        security: {
          symbol: security.symbol,
          companyName: security.company_name,
          sector: security.sector?.name ?? null,
          sectorGicsCode: security.sector?.gics_code ?? null,
          price: security.price,
          dataFrom: security.data_from,
          dataTo: security.data_to,
        },
        period: { startDate, endDate },
      };
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        step={1}
        title="Choose a CSE security"
        description="A backtest applies one set of rules to one listed security. Choose from the API-backed CSE universe and check its available historical coverage before continuing."
      />

      {config.security.symbol && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border-button-active bg-status-blue-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <SecuritySectorIcon sector={selectedSector} />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Chip color="blue" variant="subtle">
                  {config.security.symbol}
                </Chip>
                <p className="text-body-medium text-text-primary">
                  {config.security.companyName || "CSE listed security"}
                </p>
              </div>
              <p className="text-body-2-regular text-text-secondary">
                {config.security.sector || "Sector unavailable"}
              </p>
            </div>
          </div>
          {config.security.price !== null &&
            config.security.price !== undefined && (
              <div className="flex shrink-0 flex-col sm:items-end">
                <span className="text-caption-1-medium text-text-tertiary">
                  Latest available close
                </span>
                <strong className="text-title-3-semibold tabular-nums text-text-primary">
                  LKR {formatPrice(config.security.price, "en-LK")}
                </strong>
              </div>
            )}
          <div className="flex items-start gap-2 border-t border-separator-border pt-3 text-body-2-regular text-status-blue-text sm:hidden">
            <RiCheckboxCircleLine className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Coverage: {config.security.dataFrom || "not reported"} to{" "}
              {config.security.dataTo || "not reported"}
            </span>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Input
          label="Search CSE securities"
          hint={
            symbolError?.message ||
            "Search by ticker symbol or company name. Results come from the Markets API."
          }
          value={search}
          onChange={setSearch}
          placeholder="For example, COMB or Commercial Bank"
          leadingIcon={RiSearchLine}
          isInvalid={Boolean(symbolError)}
          autoComplete="off"
          fieldClassName="ring-1 ring-inset ring-border-button-default"
        />
        <BacktestFieldError>{symbolError?.message}</BacktestFieldError>
      </div>

      <section className="flex flex-col gap-3">
        <BacktestSectionHeader
          title={search.trim() ? "Matching securities" : "Available securities"}
          description={
            isLoading
              ? "Loading the latest available security list."
              : `${securities.length} ${securities.length === 1 ? "security" : "securities"} available`
          }
        />

        <div className="max-h-80 overflow-y-auto rounded-2xl border border-border-table bg-background-primary-default">
          {isLoading ? (
            <div
              className="flex items-center justify-center gap-2 p-8 text-body-regular text-text-secondary"
              role="status"
            >
              <RiLoader4Line className="size-5 animate-spin" aria-hidden />
              Loading CSE securities
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
              <p className="text-body-regular text-text-secondary">{loadError}</p>
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiRefreshLine}
                onClick={() => setRequestVersion((version) => version + 1)}
              >
                Try again
              </Button>
            </div>
          ) : securities.length === 0 ? (
            <p className="p-8 text-center text-body-regular text-text-secondary">
              No securities match “{search}”. Try a ticker or a shorter company name.
            </p>
          ) : (
            <ul className="divide-y divide-separator-border">
              {securities.map((security) => {
                const isSelected = config.security.symbol === security.symbol;
                return (
                  <li key={security.symbol}>
                    <button
                      type="button"
                      onClick={() => handleSelectSecurity(security)}
                      aria-pressed={isSelected}
                      className={cx(
                        "flex w-full items-center gap-3 px-3 py-3 text-left outline-none transition-colors sm:px-4",
                        "hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
                        isSelected && "bg-status-blue-background",
                      )}
                    >
                      <SecuritySectorIcon sector={security.sector} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-medium text-text-primary">
                          {security.symbol}
                        </span>
                        <span className="truncate text-body-2-regular text-text-secondary">
                          {security.company_name}
                        </span>
                      </span>
                      <span className="hidden shrink-0 flex-col items-end sm:flex">
                        <span className="text-body-medium tabular-nums text-text-primary">
                          {security.price === null
                            ? "Price unavailable"
                            : `LKR ${formatPrice(security.price, "en-LK")}`}
                        </span>
                        <span className="text-caption-1-medium text-text-tertiary">
                          {security.data_from && security.data_to
                            ? `${security.data_from} to ${security.data_to}`
                            : "Coverage not reported"}
                        </span>
                      </span>
                      {isSelected && (
                        <RiCheckboxCircleLine
                          className="size-5 shrink-0 text-status-blue-text"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
