import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { RiInformationLine } from "@remixicon/react";
import { Tooltip, TooltipTrigger } from "../base/tooltip/tooltip";
import { cx } from "../../utils/cx";

interface InfoTipProps {
  /** Names the trigger for screen readers: "More about {label}". */
  label: string;
  /** Overrides the default "More about {label}" accessible name. */
  ariaLabel?: string;
  /** Optional bold first line inside the tooltip. */
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The small "i" next to a heading or term that holds a short explanation,
 * so pages keep one plain line on screen and the detail one hover or tap
 * away. React Aria's tooltip owns hover, focus, Escape and
 * aria-describedby; the trigger is a real button so keyboard and
 * screen-reader users can reach it.
 */
export function InfoTip({ label, ariaLabel, title, children, className }: InfoTipProps) {
  return (
    <TooltipTrigger delay={250} closeDelay={100}>
      <AriaButton
        type="button"
        aria-label={ariaLabel ?? `More about ${label}`}
        className={cx(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-foreground-icon-tertiary outline-none transition-colors hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
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
        {title && (
          <span className="block text-caption-1-semibold text-text-primary">
            {title}
          </span>
        )}
        <span
          className={cx(
            "block text-body-2-regular text-text-secondary",
            title && "mt-0.5",
          )}
        >
          {children}
        </span>
      </Tooltip>
    </TooltipTrigger>
  );
}
