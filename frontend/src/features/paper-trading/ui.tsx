import type { ReactNode } from 'react';
import { Button } from '../../components/base/buttons/button';
import { cx } from '../../utils/cx';

/**
 * The shared BoardUI surface for every paper-trading screen. Before the
 * BoardUI migration each of these was a hand-written class in
 * paper-trading.css; they live here now so the ticket, the orders history and
 * the portfolio overview cannot drift apart, and so a card's loading/error/
 * empty treatment is written once rather than six times.
 *
 * Nothing here holds state or touches the API — these are presentation only.
 */

/** A labelled form row: the label sits above its control, as in BoardUI's Input. */
export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('flex w-full flex-col items-start gap-1', className)}>
      <span className="text-body-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

/** The panel every card-shaped surface in this feature sits in. */
export function Card({
  children,
  busy,
  className,
}: {
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'relative overflow-hidden rounded-2xl border border-border-table bg-background-primary-default',
        className,
      )}
      aria-busy={busy}
    >
      {children}
    </section>
  );
}

/**
 * The indeterminate bar shown while a card refetches. Deliberately a
 * `role="status"` sibling pinned to the card's top edge rather than a spinner
 * that replaces the content: a background refetch must not blank figures the
 * user is still reading.
 */
export function CardProgress({ label }: { label: string }) {
  return (
    <span
      className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-button-primary"
      role="status"
      aria-label={label}
    />
  );
}

export function CardHeading({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-headline-medium text-text-primary">{title}</h2>
        {subtitle && <span className="text-body-2-medium text-text-tertiary">{subtitle}</span>}
      </div>
      {actions}
    </div>
  );
}

/** A quiet, centred line for empty and loading states inside a card. */
export function StateMessage({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-body-medium text-text-secondary">{children}</p>;
}

/**
 * A failed request. `role` is left to the caller: most of these render on a
 * settled query where the message is simply part of the page, and only the
 * ones that appear in response to a user action should interrupt a screen
 * reader.
 */
export function ErrorCard({ children, role }: { children: ReactNode; role?: 'alert' }) {
  return (
    <div
      role={role}
      className="rounded-2xl border border-status-rose-background bg-status-rose-background px-4 py-3 text-body-medium text-status-rose-text"
    >
      {children}
    </div>
  );
}

/**
 * Not an error: a legitimate answer the data can't give yet (no price for the
 * chosen session, no estimate requested). Warning treatment, never the error
 * one — the distinction matters most for PRICE_UNAVAILABLE, which is a fact
 * about the dataset rather than a failure.
 */
export function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-status-yellow-background bg-status-yellow-background px-4 py-3 text-body-medium text-status-yellow-text">
      {children}
    </div>
  );
}

/** ▲/▼ so direction is never carried by colour alone. */
export function DirectionGlyph({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') return null;
  return (
    <span aria-hidden="true" className="mr-1">
      {direction === 'up' ? '▲' : '▼'}
    </span>
  );
}

/**
 * The Previous/Next pager used by the orders history and the cash ledger.
 * BoardUI ships a numbered Pagination component, but it hardcodes English
 * labels with no i18n hook, so this stays on translated Buttons — same call
 * as the Markets screen.
 */
export function Pager({
  label,
  previousLabel,
  nextLabel,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  label: ReactNode;
  previousLabel: string;
  nextLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="flex items-center justify-between gap-4 border-t border-separator-border px-4 py-3">
      <span className="text-body-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="small" disabled={!canGoPrevious} onClick={onPrevious}>
          {previousLabel}
        </Button>
        <Button variant="secondary" size="small" disabled={!canGoNext} onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </footer>
  );
}

/** A full-width shimmer standing in for one table row while it loads. */
export function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns}>
        <div className="h-5 w-full animate-pulse rounded bg-background-tertiary-default" />
      </td>
    </tr>
  );
}
