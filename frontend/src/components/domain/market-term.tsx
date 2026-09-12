import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { RiInformationLine } from "@remixicon/react";
import { Tooltip, TooltipTrigger } from "../base/tooltip/tooltip";
import { cx } from "../../utils/cx";

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
    <TooltipTrigger delay={250} closeDelay={100}>
      <AriaButton
        type="button"
        aria-label={t("marketTerms.explain", { term: label })}
        className={cx(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-foreground-icon-tertiary outline-none transition-colors hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          className,
        )}
      >
        <RiInformationLine className="size-3.5" aria-hidden />
      </AriaButton>
      <Tooltip
        size="md"
        showArrow={false}
        className="app-panel-glass max-w-72 rounded-2xl border border-border-button-default px-3.5 py-3 shadow-lg"
      >
        <span className="block text-caption-1-semibold text-text-primary">
          {label}
        </span>
        <span className="mt-0.5 block text-body-2-regular text-text-secondary">
          {t(`marketTerms.${term}.description`)}
        </span>
      </Tooltip>
    </TooltipTrigger>
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
