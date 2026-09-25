import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "../../utils/cx";
import { InfoTip } from "./info-tip";

export type MarketTermKey =
  | "security"
  | "sector"
  | "marketCap"
  | "change"
  | "changePercent"
  | "volume"
  | "peRatio"
  | "pbRatio"
  | "open"
  | "high"
  | "low"
  | "close"
  | "sharesOutstanding";

interface MarketTermHelpProps {
  term: MarketTermKey;
  className?: string;
}

/**
 * A compact, accessible explanation for stock-market vocabulary.
 *
 * BoardUI's React Aria tooltip owns hover, keyboard focus, Escape dismissal,
 * viewport collision handling and aria-describedby. Keeping the trigger as a
 * real button also makes the otherwise decorative info mark discoverable to
 * keyboard and screen-reader users.
 */
export function MarketTermHelp({ term, className }: MarketTermHelpProps) {
  const { t } = useTranslation();
  const label = t(`marketTerms.${term}.label`);

  return (
    <InfoTip
      label={label}
      ariaLabel={t("marketTerms.explain", { term: label })}
      title={label}
      className={className}
    >
      {t(`marketTerms.${term}.description`)}
    </InfoTip>
  );
}

interface MarketTermProps extends MarketTermHelpProps {
  label?: ReactNode;
}

/** Visible term label followed by its compact explanation trigger. */
export function MarketTerm({ term, label, className }: MarketTermProps) {
  const { t } = useTranslation();

  return (
    <span className={cx("inline-flex items-center gap-1", className)}>
      <span>{label ?? t(`marketTerms.${term}.label`)}</span>
      <MarketTermHelp term={term} />
    </span>
  );
}
