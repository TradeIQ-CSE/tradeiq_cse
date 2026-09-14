import { useTranslation } from "react-i18next";
import { RiAddLine } from "@remixicon/react";
import { Button } from "../../components/base/buttons/button";
import { Select, SelectItem } from "../../components/base/select/select";
import { PageToolbar } from "../../components/application/layout/application-layout";
import { Portfolio } from "./types";

interface PortfolioSelectorProps {
  portfolios: Portfolio[];
  selectedId: string | null;
  onSelect: (portfolioId: string) => void;
  onCreateNew: () => void;
}

// Native <select> + <button>, not a styled <div onClick> menu — the paper
// trading UI is keyboard-operated the same way the platform's own form
// controls are.
export function PortfolioSelector({
  portfolios,
  selectedId,
  onSelect,
  onCreateNew,
}: PortfolioSelectorProps) {
  const { t } = useTranslation();

  return (
    <PageToolbar
      className="sm:flex-nowrap"
      aria-label={t("portfolio.selector.toolbarLabel")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
        <span className="text-body-2-medium text-text-secondary">
          {t("portfolio.selector.label")}
        </span>
        <Select
          aria-label={t("portfolio.selector.label")}
          className="w-full"
          selectedKey={selectedId}
          onSelectionChange={(key) => onSelect(String(key))}
        >
          {portfolios.map((portfolio) => (
            <SelectItem
              key={portfolio.portfolio_id}
              id={portfolio.portfolio_id}
              textValue={portfolio.name}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-medium text-text-primary">
                  {portfolio.name}
                </span>
                <span className="text-caption-1-medium text-text-tertiary">
                  {t("portfolio.selector.paperLabel")}
                </span>
              </span>
            </SelectItem>
          ))}
        </Select>
      </div>
      <Button
        className="sm:ml-auto"
        variant="secondary"
        leadingIcon={RiAddLine}
        onClick={onCreateNew}
      >
        {t("portfolio.selector.new")}
      </Button>
    </PageToolbar>
  );
}
