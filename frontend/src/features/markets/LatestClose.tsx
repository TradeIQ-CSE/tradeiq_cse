import { useTranslation } from "react-i18next";
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from "../../components/application/financial-data";
import { cx } from "../../utils/cx";
import { formatPrice, formatSigned } from "./format";

/**
 * The labelled latest close with its change since the day before, shared by
 * the company and index pages so a price always reads the same way.
 */
export function LatestClose({
  close,
  change,
  changePct,
  currency,
  locale,
}: {
  close: number;
  change: number | null;
  changePct: number | null;
  currency?: string;
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:items-end">
      <span className="text-body-2-medium text-text-secondary">
        {t("securityDetail.latestClose")}
      </span>
      <div className="flex items-baseline gap-1.5">
        {currency && (
          <span className="text-body-2-medium text-text-tertiary">
            {currency}
          </span>
        )}
        <strong className="text-title-2-medium tabular-nums text-text-primary">
          {formatPrice(close, locale)}
        </strong>
      </div>
      {change !== null && (
        <div
          className={cx(
            "flex items-center text-body-2-medium tabular-nums",
            financialToneClass(change),
          )}
        >
          <FinancialDirectionGlyph
            direction={change > 0 ? "up" : change < 0 ? "down" : "flat"}
          />
          {formatSigned(change, 2, locale)}
          {changePct === null ? "" : ` (${formatSigned(changePct, 2, locale)}%)`}
          <span className="ml-1 text-text-tertiary">
            {t("securityDetail.sincePrevious")}
          </span>
        </div>
      )}
    </div>
  );
}
