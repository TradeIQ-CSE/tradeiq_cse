import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiLoader4Line,
} from '@remixicon/react';
import { cx } from '../../../utils/cx';

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

const pageWidths = {
  fluid: 'max-w-screen-2xl',
  reading: 'max-w-4xl',
  form: 'max-w-2xl',
} as const;

export interface AppPageProps extends HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof pageWidths;
}

/** Width and vertical rhythm shared by every application route. */
export function AppPage({ width = 'fluid', className, ...props }: AppPageProps) {
  return (
    <div
      className={cx('mx-auto flex w-full flex-col gap-5', pageWidths[width], className)}
      {...props}
    />
  );
}

export interface PageIntroProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

/** Translucent orientation surface for page purpose and primary actions. */
export function PageIntro({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...props
}: PageIntroProps) {
  return (
    <header
      className={cx(
        'app-page-intro flex flex-col gap-4 rounded-3xl border p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && (
          <p className="text-caption-1-semibold text-status-blue-text">{eyebrow}</p>
        )}
        <h1 className="text-title-1-medium text-text-primary">{title}</h1>
        {description && (
          <p className="max-w-3xl text-body-regular text-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const panelStyles = {
  default: 'border-border-table bg-background-primary-default shadow-xs',
  subtle: 'border-border-button-default bg-background-secondary-default',
  glass: 'app-panel-glass',
} as const;

export interface AppPanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof panelStyles;
}

/** Opaque by default so tables, charts, and forms retain strong contrast. */
export function AppPanel({ tone = 'default', className, ...props }: AppPanelProps) {
  return (
    <div
      className={cx('rounded-3xl border p-4 sm:p-5', panelStyles[tone], className)}
      {...props}
    />
  );
}

export interface StatSurfaceProps extends HTMLAttributes<HTMLElement> {
  label: ReactNode;
  value: ReactNode;
  supportingText?: ReactNode;
  icon?: IconComponent;
}

export function StatSurface({
  label,
  value,
  supportingText,
  icon: Icon,
  className,
  ...props
}: StatSurfaceProps) {
  return (
    <article
      className={cx(
        'flex min-w-0 items-start gap-3 rounded-3xl border border-border-button-default bg-background-primary-default p-4 shadow-xs',
        className,
      )}
      {...props}
    >
      {Icon && (
        <span className="flex shrink-0 rounded-2lg bg-stat-card-icon-background p-2">
          <Icon className="size-5 text-foreground-icon-primary" aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-body-medium text-text-secondary">{label}</p>
        <p className="text-title-2-medium tabular-nums text-text-primary">{value}</p>
        {supportingText && (
          <p className="text-body-2-regular text-text-tertiary">{supportingText}</p>
        )}
      </div>
    </article>
  );
}

export function PageToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-3 sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
      {...props}
    />
  );
}

type StateKind = 'loading' | 'empty' | 'error';

const stateIcons: Record<StateKind, IconComponent> = {
  loading: RiLoader4Line,
  empty: RiInformationLine,
  error: RiErrorWarningLine,
};

export interface PageStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  kind: StateKind;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function PageState({
  kind,
  title,
  description,
  action,
  className,
  ...props
}: PageStateProps) {
  const Icon = stateIcons[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className={cx(
        'flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border border-border-button-default bg-background-primary-default px-5 py-10 text-center',
        className,
      )}
      {...props}
    >
      <span className="flex rounded-full bg-background-secondary-default p-3">
        <Icon
          className={cx(
            'size-6 text-foreground-icon-secondary',
            kind === 'loading' && 'animate-spin',
            kind === 'error' && 'text-foreground-icon-error',
          )}
          aria-hidden
        />
      </span>
      <div className="flex max-w-lg flex-col gap-1">
        <h2 className="text-headline-medium text-text-primary">{title}</h2>
        {description && <p className="text-body-regular text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type NoticeTone = 'information' | 'success' | 'warning' | 'error';

const noticeStyles: Record<NoticeTone, { surface: string; icon: string; Icon: IconComponent }> = {
  information: {
    surface: 'bg-status-blue-background text-status-blue-text',
    icon: 'text-status-blue-text',
    Icon: RiInformationLine,
  },
  success: {
    surface: 'bg-status-lime-background text-status-lime-text',
    icon: 'text-status-lime-text',
    Icon: RiCheckboxCircleLine,
  },
  warning: {
    surface: 'bg-status-yellow-background text-status-yellow-text',
    icon: 'text-status-yellow-text',
    Icon: RiAlertLine,
  },
  error: {
    surface: 'bg-status-rose-background text-status-rose-text',
    icon: 'text-status-rose-text',
    Icon: RiErrorWarningLine,
  },
};

export interface AppNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  title?: ReactNode;
}

export function AppNotice({
  tone = 'information',
  title,
  children,
  className,
  ...props
}: AppNoticeProps) {
  const { Icon, surface, icon } = noticeStyles[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={cx('flex items-start gap-3 rounded-2xl p-4', surface, className)}
      {...props}
    >
      <Icon className={cx('mt-0.5 size-5 shrink-0', icon)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="text-body-medium">{title}</p>}
        <div className="text-body-regular">{children}</div>
      </div>
    </div>
  );
}
