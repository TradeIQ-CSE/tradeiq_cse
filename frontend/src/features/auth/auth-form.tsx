import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TradeIqLogo } from '../../components/foundations/brand/tradeiq-logo';

/**
 * Shared frame for the two auth pages.
 *
 * The proportions follow BoardUI's own auth card — a 400px column, rounded-3xl
 * on border/button/default, the secondary surface in dark — but the card is
 * ours rather than an install of theirs: that component hardcodes English
 * copy, submits uncontrolled FormData with no way to attach a field error,
 * and pulls in twenty-four social providers this product does not support.
 * What it is worth taking is the shape, which this matches.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-secondary-default p-6">
      <div className="flex w-full max-w-[400px] flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs sm:p-8">
        <Link
          to="/"
          aria-label={t('app.name')}
          className="mb-5 flex w-fit items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <TradeIqLogo size="md" />
          <span className="text-headline-semibold text-text-primary">{t('app.name')}</span>
        </Link>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-title-2-medium text-text-primary">{title}</h1>
          <p className="text-body-regular text-text-secondary">{subtitle}</p>
        </div>

        <div className="mt-6">{children}</div>

        <p className="mt-6 text-body-regular text-text-secondary">{footer}</p>
      </div>
    </div>
  );
}

/**
 * A failed submission that belongs to the form rather than to one field.
 *
 * `role="alert"` because it appears in response to the user's own action and
 * is the only feedback that the attempt failed.
 */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2lg bg-status-rose-background px-3 py-2 text-body-medium text-status-rose-text"
    >
      {children}
    </div>
  );
}

/**
 * The messages under one field.
 *
 * A validation envelope carries one entry per failed constraint, so a single
 * field can legitimately arrive with several — they are all rendered, not just
 * the first.
 */
export function FieldErrors({ messages }: { messages: string[] }) {
  return (
    <>
      {messages.map((message) => (
        <span key={message} className="block">
          {message}
        </span>
      ))}
    </>
  );
}
