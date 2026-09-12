import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TradeIqLogo } from '../../components/foundations/brand/tradeiq-logo';
import { AppBackdrop } from '../../components/layout/AppBackdrop';
import { ThemeModeControl } from '../../theme/ThemeModeControl';
import {
  RiBarChartBoxLine,
  RiHistoryLine,
  RiShieldCheckLine,
} from '@remixicon/react';

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

  const trustPoints = [
    { key: 'market', Icon: RiBarChartBoxLine },
    { key: 'practice', Icon: RiShieldCheckLine },
    { key: 'history', Icon: RiHistoryLine },
  ] as const;

  return (
    <div className="app-shell relative min-h-dvh overflow-hidden bg-background-full p-4 sm:p-6">
      <AppBackdrop />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeModeControl compact />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-5xl items-center gap-8 py-16 sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[minmax(0,1fr)_400px] lg:py-12">
        <section className="hidden max-w-xl flex-col gap-7 lg:flex" aria-label={t('auth.trust.label')}>
          <Link
            to="/"
            aria-label={t('app.name')}
            className="flex w-fit items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <TradeIqLogo size="lg" />
            <span className="text-title-2-medium text-text-primary">{t('app.name')}</span>
          </Link>
          <div>
            <p className="text-caption-1-semibold text-status-blue-text">{t('auth.trust.eyebrow')}</p>
            <h2 className="mt-2 max-w-lg text-display-3-medium text-text-primary">
              {t('auth.trust.title')}
            </h2>
            <p className="mt-3 max-w-lg text-body-regular text-text-secondary">
              {t('auth.trust.description')}
            </p>
          </div>
          <ul className="grid gap-3">
            {trustPoints.map(({ key, Icon }) => (
              <li key={key} className="app-panel-glass flex items-start gap-3 rounded-2xl border p-3.5">
                <span className="flex shrink-0 rounded-xl bg-stat-card-icon-background p-2">
                  <Icon className="size-5 text-foreground-icon-primary" aria-hidden />
                </span>
                <div>
                  <p className="text-body-medium text-text-primary">{t(`auth.trust.points.${key}.title`)}</p>
                  <p className="text-body-2-regular text-text-secondary">{t(`auth.trust.points.${key}.description`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex w-full max-w-[400px] flex-col justify-self-center rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-lg sm:p-8">
        <Link
          to="/"
          aria-label={t('app.name')}
          className="mb-5 flex w-fit items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring lg:hidden"
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
