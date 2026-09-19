import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api";
import { Button } from "../../components/base/buttons/button";
import { Input } from "../../components/base/input/input";
import { fieldErrors } from "../auth/field-errors";
import { Card, CardHeading, ErrorCard } from "./ui";
import { Portfolio } from "./types";
import { useCreatePortfolio } from "./usePortfolios";
import { TradingDetails } from './TradingDetails';
import { localeFor } from '@/i18n';
import { formatMoney } from './format';

// docs/api/paper-trading-v1.md §5.1.
const NAME_MAX_LENGTH = 100;
const MIN_STARTING_CAPITAL = 100_000;
const MAX_STARTING_CAPITAL = 100_000_000;

const KNOWN_FIELDS = ["name", "starting_capital"] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

interface CreatePortfolioFormProps {
  onCreated?: (portfolio: Portfolio) => void;
  initialName?: string;
  initialCapital?: number;
  simple?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function CreatePortfolioForm({ onCreated, initialName = '', initialCapital, simple = false, onBusyChange }: CreatePortfolioFormProps) {
  const { t, i18n } = useTranslation();
  const mutation = useCreatePortfolio();
  const [name, setName] = useState(initialName);
  const [startingCapital, setStartingCapital] = useState(() => initialCapital === undefined ? '' : String(initialCapital));
  const [fieldMessages, setFieldMessages] = useState<
    Partial<Record<KnownField, string[]>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  // Minted once per logical submission (§4): a double-click or a
  // retry-after-timeout must reuse this key so the server sees one request,
  // not a fresh one each time. Only regenerated after a successful create
  // (the form resets to a new submission) or a 409 IDEMPOTENCY_KEY_REUSED
  // (the stored key is no longer safe to replay).
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  // A synchronous guard: mutation.isPending only flips after a render, which
  // is too late to stop two submits fired in the same tick (e.g. a
  // double-click) from both reaching mutateAsync.
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (Object.keys(fieldMessages).length === 0) return;
    const frame = requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]');
      field?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [fieldMessages]);
  useEffect(() => {
    onBusyChange?.(mutation.isPending);
    return () => onBusyChange?.(false);
  }, [mutation.isPending, onBusyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    setFieldMessages({});

    try {
      const created = await mutation.mutateAsync({
        name,
        starting_capital: Number(startingCapital),
        idempotencyKey,
      });
      setName("");
      setStartingCapital("");
      setIdempotencyKey(crypto.randomUUID());
      onCreated?.(created.data);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.body.code === "VALIDATION_FAILED"
      ) {
        const mapped = fieldErrors(error, KNOWN_FIELDS);
        const byField: Partial<Record<KnownField, string[]>> = {};
        for (const field of mapped.fields) byField[field.name] = field.errors;
        setFieldMessages(byField);
        if (mapped.unmatched.length > 0)
          setFormError(mapped.unmatched.join(" "));
      } else if (
        error instanceof ApiError &&
        error.body.code === "IDEMPOTENCY_KEY_REUSED"
      ) {
        // The stored key was replayed against a different payload. A fresh
        // key makes the next attempt a new logical submission rather than
        // another replay of the mismatched one.
        setIdempotencyKey(crypto.randomUUID());
        setFormError(t("portfolio.create.errors.idempotencyReused"));
      } else if (error instanceof ApiError) {
        setFormError(error.body.message);
      } else {
        setFormError(t("portfolio.create.errors.unreachable"));
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeading title={t("portfolio.create.title")} />

      <form ref={formRef} className="flex flex-col gap-4 px-4 pb-4" onSubmit={handleSubmit}
        onInvalidCapture={(event) => {
          // The invalid field may be hidden. Reveal it before focus instead
          // of asking native validation to focus an invisible control.
          if (simple) event.preventDefault();
          setInvalid(true);
          const target = event.target as HTMLElement;
          requestAnimationFrame(() => target.focus());
        }}>
        {formError && <ErrorCard role="alert">{formError}</ErrorCard>}

        {simple && (
          <div className="flex flex-col gap-1 rounded-2xl bg-background-secondary-default p-4">
            <p className="break-words text-body-medium text-text-primary">{name}</p>
            <p className="text-body-2-regular text-text-secondary">
              {t('paperTrading.workflow.setupCash', { cash: formatMoney(Number(startingCapital), localeFor(i18n.resolvedLanguage ?? i18n.language)) })}
            </p>
            <p className="text-body-2-regular text-text-tertiary">{t('paperTrading.workflow.setupHelp')}</p>
          </div>
        )}

        <TradingDetails title={t('paperTrading.workflow.configureAccount')}
          expanded={!simple || invalid || Object.keys(fieldMessages).length > 0} disabled={mutation.isPending}>
        <div className="flex flex-col gap-4">

        <Input
          label={t("portfolio.create.name")}
          value={name}
          onChange={setName}
          minLength={1}
          maxLength={NAME_MAX_LENGTH}
          isRequired
          isDisabled={mutation.isPending}
          isInvalid={Boolean(fieldMessages.name?.length) || (invalid && (name.length < 1 || name.length > NAME_MAX_LENGTH))}
          hint={fieldMessages.name?.join(" ") || (invalid && (name.length < 1 || name.length > NAME_MAX_LENGTH) ? t('paperTrading.workflow.nameHint') : undefined)}
          fieldClassName="ring-1 ring-inset ring-border-button-default"
        />

        <Input
          label={t("portfolio.create.startingCapital")}
          type="number"
          value={startingCapital}
          onChange={setStartingCapital}
          min={MIN_STARTING_CAPITAL}
          max={MAX_STARTING_CAPITAL}
          step="0.0001"
          isRequired
          isDisabled={mutation.isPending}
          isInvalid={Boolean(fieldMessages.starting_capital?.length) || (invalid && (!startingCapital || !Number.isFinite(Number(startingCapital)) || Number(startingCapital) < MIN_STARTING_CAPITAL || Number(startingCapital) > MAX_STARTING_CAPITAL))}
          hint={
            fieldMessages.starting_capital?.join(" ") ||
            t("portfolio.create.startingCapitalHint")
          }
          fieldClassName="ring-1 ring-inset ring-border-button-default"
        />
        </div>
        </TradingDetails>

        <Button
          type="submit"
          variant="primary"
          className="w-full sm:w-auto sm:self-start"
          disabled={mutation.isPending}
        >
          {t(simple ? 'paperTrading.workflow.createAccount' : "portfolio.create.submit")}
        </Button>
      </form>
    </Card>
  );
}
