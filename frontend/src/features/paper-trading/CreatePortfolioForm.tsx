import { FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/base/buttons/button';
import { fieldErrors } from '../auth/field-errors';
import {
  Card,
  CardHeading,
  ErrorCard,
  Field,
} from './ui';
import { fieldShell } from './ui-styles';
import { Portfolio } from './types';
import { useCreatePortfolio } from './usePortfolios';

// docs/api/paper-trading-v1.md §5.1.
const NAME_MAX_LENGTH = 100;
const MIN_STARTING_CAPITAL = 100_000;
const MAX_STARTING_CAPITAL = 100_000_000;

const KNOWN_FIELDS = ['name', 'starting_capital'] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

interface CreatePortfolioFormProps {
  onCreated?: (portfolio: Portfolio) => void;
}

export function CreatePortfolioForm({ onCreated }: CreatePortfolioFormProps) {
  const { t } = useTranslation();
  const mutation = useCreatePortfolio();
  const [name, setName] = useState('');
  const [startingCapital, setStartingCapital] = useState('');
  const [fieldMessages, setFieldMessages] = useState<Partial<Record<KnownField, string[]>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Minted once per logical submission (§4): a double-click or a
  // retry-after-timeout must reuse this key so the server sees one request,
  // not a fresh one each time. Only regenerated after a successful create
  // (the form resets to a new submission) or a 409 IDEMPOTENCY_KEY_REUSED
  // (the stored key is no longer safe to replay).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // A synchronous guard: mutation.isPending only flips after a render, which
  // is too late to stop two submits fired in the same tick (e.g. a
  // double-click) from both reaching mutateAsync.
  const submitting = useRef(false);

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
      setName('');
      setStartingCapital('');
      setIdempotencyKey(crypto.randomUUID());
      onCreated?.(created.data);
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrors(error, KNOWN_FIELDS);
        const byField: Partial<Record<KnownField, string[]>> = {};
        for (const field of mapped.fields) byField[field.name] = field.errors;
        setFieldMessages(byField);
        if (mapped.unmatched.length > 0) setFormError(mapped.unmatched.join(' '));
      } else if (error instanceof ApiError && error.body.code === 'IDEMPOTENCY_KEY_REUSED') {
        // The stored key was replayed against a different payload. A fresh
        // key makes the next attempt a new logical submission rather than
        // another replay of the mismatched one.
        setIdempotencyKey(crypto.randomUUID());
        setFormError(t('portfolio.create.errors.idempotencyReused'));
      } else if (error instanceof ApiError) {
        setFormError(error.body.message);
      } else {
        setFormError(t('portfolio.create.errors.unreachable'));
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeading title={t('portfolio.create.title')} />

      <form className="flex flex-col gap-4 px-4 pb-4" onSubmit={handleSubmit}>
        {formError && <ErrorCard role="alert">{formError}</ErrorCard>}

        <Field label={t('portfolio.create.name')}>
          <input
            type="text"
            className={fieldShell}
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={1}
            maxLength={NAME_MAX_LENGTH}
            required
          />
          {fieldMessages.name?.map((message) => (
            <span className="text-body-2-medium text-status-rose-text" key={message}>
              {message}
            </span>
          ))}
        </Field>

        <Field label={t('portfolio.create.startingCapital')}>
          <input
            type="number"
            className={fieldShell}
            value={startingCapital}
            onChange={(event) => setStartingCapital(event.target.value)}
            min={MIN_STARTING_CAPITAL}
            max={MAX_STARTING_CAPITAL}
            step="0.0001"
            required
          />
          {fieldMessages.starting_capital?.map((message) => (
            <span className="text-body-2-medium text-status-rose-text" key={message}>
              {message}
            </span>
          ))}
        </Field>

        <Button type="submit" variant="primary" className="self-start" disabled={mutation.isPending}>
          {t('portfolio.create.submit')}
        </Button>
      </form>
    </Card>
  );
}
