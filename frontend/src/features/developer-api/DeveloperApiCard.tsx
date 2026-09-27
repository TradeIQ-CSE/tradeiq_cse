import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  RiCalendarLine,
  RiKeyLine,
  RiLockLine,
  RiPriceTag3Line,
  RiPulseLine,
  RiTimeLine,
} from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { Input } from '../../components/base/input/input';
import { InfoTip } from '../../components/domain/info-tip';
import { localeFor } from '../../i18n';
import { ApiError } from '../../lib/api';
import { formatDateTime } from '../paper-trading/format';
import { Card, CardHeading, CardProgress, ErrorCard } from '../paper-trading/ui';
import { CodeBlock } from './CodeBlock';
import { ConfirmDialog } from './ConfirmDialog';
import { UsageChart } from './UsageChart';
import type { CreatedDeveloperKey, DeveloperUsage } from './api';
import {
  useCreateDeveloperKey,
  useDeveloperKey,
  useDeveloperUsage,
  useRegenerateDeveloperKey,
  useRevokeDeveloperKey,
} from './useDeveloperKey';

const LABEL_MAX_LENGTH = 100;

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

function formatDateOnly(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
}

function formatResetTime(iso: string, locale: string): string {
  // h23 keeps the clock 24-hour ("15:00") in every locale, matching the
  // product's own example rather than a locale-dependent AM/PM split.
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** One "icon · label · value" row — the shape every key fact and the usage line share. */
function FactRow({ icon: Icon, label, children }: { icon: IconComponent; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-body-2-regular">
      <Icon className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      <span className="text-text-secondary">{label}</span>
      <span className="ml-auto flex items-center gap-1 text-text-primary">{children}</span>
    </div>
  );
}

function UsageSection({
  usage,
  isPending,
  isError,
  locale,
}: {
  usage: DeveloperUsage | null | undefined;
  isPending: boolean;
  isError: boolean;
  locale: string;
}) {
  const { t } = useTranslation();

  if (isPending) {
    return <div className="h-16 w-full max-w-sm animate-pulse rounded bg-background-tertiary-default" />;
  }
  // No documented error path here beyond §7's shared 401 (session loss,
  // already handled by authFetch); quietly showing nothing beats an error
  // box for a secondary figure inside a card that already has its facts.
  if (isError || !usage) return null;

  const usedLabel =
    usage.used === null
      ? '—'
      : t('developerApi.usage.value', {
          used: usage.used,
          limit: usage.limit,
          time: formatResetTime(usage.reset_at, locale),
        });

  return (
    <div className="flex flex-col gap-3 border-t border-separator-border pt-4">
      <FactRow icon={RiPulseLine} label={t('developerApi.usage.title')}>
        {usedLabel}
        {usage.used === null && (
          <InfoTip label={t('developerApi.usage.title')}>{t('developerApi.usage.unavailable')}</InfoTip>
        )}
      </FactRow>
      <UsageChart daily={usage.daily} locale={locale} />
    </div>
  );
}

type ConfirmAction = 'regenerate' | 'revoke' | null;

/** The Settings page's one card: create, view, regenerate and revoke the user's own public-API key. */
export function DeveloperApiCard() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const keyQuery = useDeveloperKey();
  const usageQuery = useDeveloperUsage();
  const create = useCreateDeveloperKey();
  const regenerate = useRegenerateDeveloperKey();
  const revoke = useRevokeDeveloperKey();

  const [label, setLabel] = useState('');
  // The secret only ever lives here, set directly from the mutate() success
  // callback's argument — never read back off create.data/regenerate.data,
  // so it never needs to be kept out of the query cache; there's simply
  // never a copy in it.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const key = keyQuery.data ?? null;

  function reveal(created: CreatedDeveloperKey) {
    setRevealedSecret(created.key);
    setLabel('');
  }

  function handleCreate() {
    create.mutate(label.trim() || undefined, {
      onSuccess: reveal,
      onError: (error) => {
        // The user already has a key (a second tab, a retried click); show
        // it instead of an error for a state that isn't really a failure.
        if (error instanceof ApiError && error.body.code === 'API_KEY_EXISTS') {
          void keyQuery.refetch();
        }
      },
    });
  }

  function handleRegenerate() {
    regenerate.mutate(undefined, {
      onSuccess: (created) => {
        setConfirmAction(null);
        reveal(created);
      },
    });
  }

  function handleRevoke() {
    revoke.mutate(undefined, {
      onSuccess: () => {
        setConfirmAction(null);
        setRevealedSecret(null);
      },
    });
  }

  const createError =
    create.isError && !(create.error instanceof ApiError && create.error.body.code === 'API_KEY_EXISTS')
      ? t('developerApi.errors.create')
      : null;
  const actionError = regenerate.isError || revoke.isError ? t('developerApi.errors.action') : null;

  return (
    <Card busy={keyQuery.isFetching}>
      {keyQuery.isFetching && <CardProgress label={t('developerApi.loading')} />}

      <CardHeading
        title={t('developerApi.title')}
        info={t('developerApi.infoTip')}
        actions={
          <Link to="/developers" className="text-body-2-regular text-status-blue-text hover:underline">
            {t('developerApi.guideLink')}
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
        {keyQuery.isError ? (
          <ErrorCard>
            <span className="flex flex-wrap items-center gap-x-2">
              {t('developerApi.errors.load')}
              <button type="button" className="underline" onClick={() => keyQuery.refetch()}>
                {t('developerApi.errors.retry')}
              </button>
            </span>
          </ErrorCard>
        ) : keyQuery.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-5 w-full max-w-sm animate-pulse rounded bg-background-tertiary-default"
              />
            ))}
          </div>
        ) : revealedSecret ? (
          <div className="flex flex-col gap-3">
            <CodeBlock code={revealedSecret} copyLabel={t('developerApi.copyKey')} />
            <p className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
              <RiLockLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
              {t('developerApi.justCreated.saveNow')}
            </p>
            <div>
              <Button variant="primary" onClick={() => setRevealedSecret(null)}>
                {t('developerApi.justCreated.done')}
              </Button>
            </div>
          </div>
        ) : !key ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-regular text-text-secondary">{t('developerApi.noKey.description')}</p>
            <Input
              placeholder={t('developerApi.noKey.labelPlaceholder')}
              value={label}
              onChange={setLabel}
              maxLength={LABEL_MAX_LENGTH}
              isDisabled={create.isPending}
              className="max-w-sm"
            />
            {createError && (
              <p role="alert" className="text-body-2-regular text-status-rose-text">
                {createError}
              </p>
            )}
            <div>
              <Button variant="primary" onClick={handleCreate} disabled={create.isPending}>
                {t('developerApi.noKey.create')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <FactRow icon={RiKeyLine} label={t('developerApi.facts.key')}>
                <span className="font-mono">{key.prefix}••••</span>
              </FactRow>
              {key.label && (
                <FactRow icon={RiPriceTag3Line} label={t('developerApi.facts.label')}>
                  {key.label}
                </FactRow>
              )}
              <FactRow icon={RiCalendarLine} label={t('developerApi.facts.created')}>
                {formatDateOnly(key.created_at, locale)}
              </FactRow>
              <FactRow icon={RiTimeLine} label={t('developerApi.facts.lastUsed')}>
                {key.last_used_at ? formatDateTime(key.last_used_at, locale) : t('developerApi.facts.neverUsed')}
              </FactRow>
            </div>

            <UsageSection
              usage={usageQuery.data}
              isPending={usageQuery.isPending}
              isError={usageQuery.isError}
              locale={locale}
            />

            <div className="flex flex-col gap-2 border-t border-separator-border pt-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setConfirmAction('regenerate')}>
                  {t('developerApi.actions.regenerate')}
                </Button>
                <Button variant="danger" onClick={() => setConfirmAction('revoke')}>
                  {t('developerApi.actions.revoke')}
                </Button>
              </div>
              {actionError && (
                <p role="alert" className="text-body-2-regular text-status-rose-text">
                  {actionError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmAction === 'regenerate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={t('developerApi.regenerateDialog.title')}
        description={t('developerApi.regenerateDialog.description')}
        cancelLabel={t('developerApi.actions.cancel')}
        confirmLabel={t('developerApi.regenerateDialog.confirm')}
        onConfirm={handleRegenerate}
        isPending={regenerate.isPending}
      />
      <ConfirmDialog
        isOpen={confirmAction === 'revoke'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={t('developerApi.revokeDialog.title')}
        description={t('developerApi.revokeDialog.description')}
        cancelLabel={t('developerApi.actions.cancel')}
        confirmLabel={t('developerApi.revokeDialog.confirm')}
        onConfirm={handleRevoke}
        isPending={revoke.isPending}
        destructive
      />
    </Card>
  );
}
