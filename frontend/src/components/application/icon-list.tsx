import type { ReactNode } from "react";
import type { RemixiconComponentType } from "@remixicon/react";
import { cx } from "../../utils/cx";

export interface IconListItem {
  key: string;
  icon: RemixiconComponentType;
  text: ReactNode;
  /** Colour for the icon, e.g. gain or loss; neutral when omitted. */
  tone?: "gain" | "loss" | "neutral";
}

const TONE: Record<NonNullable<IconListItem["tone"]>, string> = {
  gain: "bg-status-lime-background text-status-lime-text",
  loss: "bg-status-rose-background text-status-rose-text",
  neutral: "bg-background-tertiary-default text-foreground-icon-secondary",
};

/**
 * Short facts as one row each, led by an icon that shows what kind of fact it
 * is — easier to scan than a run-on grey line.
 */
export function IconList({
  items,
  className,
}: {
  items: IconListItem[];
  className?: string;
}) {
  return (
    <ul className={cx("flex flex-col gap-2", className)}>
      {items.map(({ key, icon: Icon, text, tone = "neutral" }) => (
        <li
          key={key}
          className="flex items-center gap-2.5 text-body-medium text-text-primary"
        >
          <span
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-lg",
              TONE[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}
