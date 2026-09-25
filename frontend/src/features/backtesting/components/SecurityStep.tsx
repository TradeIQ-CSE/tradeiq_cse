import { useEffect, useMemo, useState } from "react";
import {
  RiCheckboxCircleLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SecuritySectorIcon } from "@/features/markets/SecuritySectorIcon";
import { SelectedCompany } from "@/features/markets/SelectedCompany";
import { formatPrice } from "@/features/markets/format";
import { cx } from "@/utils/cx";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { formatDay } from "../domain/descriptions";
import { getSecuritiesUniverse } from "../api/backtestApi";
import type { SecurityListItem } from "../../markets/types";
import {
  BacktestFieldError,
  BacktestSectionHeader,
  BacktestStepHeader,
} from "./BacktestStepLayout";

export function SecurityStep({ embedded = false }: { embedded?: boolean }) {
  const { config, selectSecurity, getStepErrors } = useBacktestWizard();
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
          setLoadError("Couldn’t load companies. Please try again.");
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
    selectSecurity({
      symbol: security.symbol,
      companyName: security.company_name,
      sector: security.sector?.name ?? null,
      sectorGicsCode: security.sector?.gics_code ?? null,
      price: security.price,
      dataFrom: security.data_from,
      dataTo: security.data_to,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <BacktestStepHeader
        embedded={embedded}
        title="Choose a company"
        description="Pick the company to test your idea on"
      />

      {config.security.symbol && (
        <SelectedCompany
          symbol={config.security.symbol}
          companyName={config.security.companyName}
          sector={selectedSector}
          price={config.security.price}
          historyFrom={config.security.dataFrom}
          historyTo={config.security.dataTo}
        />
      )}

      <div className="flex flex-col gap-2">
        <Input
          label="Search companies"
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
          title={search.trim() ? "Matching companies" : "Companies"}
          description={
            isLoading
              ? "Loading"
              : `${securities.length} ${securities.length === 1 ? "company" : "companies"}`
          }
        />

        <div className="max-h-80 overflow-y-auto rounded-2xl border border-border-table bg-background-primary-default">
          {isLoading ? (
            <div
              className="flex items-center justify-center gap-2 p-8 text-body-regular text-text-secondary"
              role="status"
            >
              <RiLoader4Line className="size-5 animate-spin" aria-hidden />
              Loading companies
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
              No companies match “{search}”. Try a symbol or a shorter name.
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
                        isSelected && "bg-background-secondary-default",
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
                        <span className="text-body-2-regular tabular-nums text-text-primary">
                          {security.price === null
                            ? "No price yet"
                            : `LKR ${formatPrice(security.price, "en-LK")}`}
                        </span>
                        {security.data_from && security.data_to && (
                          <span className="text-caption-1-regular text-text-secondary">
                            History from {formatDay(security.data_from)}
                          </span>
                        )}
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
