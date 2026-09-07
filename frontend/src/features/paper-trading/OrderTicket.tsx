import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';
import { EstimatePanel } from './EstimatePanel';
import { mapOrderCode } from './order-messages';
import { OrderResultOutcome, ResultBanner } from './ResultBanner';
import { SymbolPicker } from './SymbolPicker';
import { Order, OrderEstimate, OrderSide } from './types';
import { useEstimateOrder, useSubmitOrder } from './useOrders';
import { Button } from '../../components/base/buttons/button';
import { Card, CardHeading, Field } from './ui';
import { fieldShell } from './ui-styles';

interface OrderTicketProps {
  portfolioId: string;
}

interface StoredEstimate {
  hash: string;
  estimate: OrderEstimate;
}

// Point C: the hash a Confirm click is gated on. Built from the raw quantity
// *text*, not a parsed number — every keystroke, including one that makes
// the field momentarily invalid, changes the hash, so there is no window
// where an edited-but-not-yet-revalidated quantity could still match a
// stale estimate. A field added later only has to be folded into this one
// function for the gate to keep working; it is never bypassed by forgetting
// to wire up an onChange handler that clears stored state by hand.
function buildHash(symbol: string, side: OrderSide, quantityText: string): string {
  return `${symbol}|${side}|${quantityText}`;
}

export function OrderTicket({ portfolioId }: OrderTicketProps) {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantityText, setQuantityText] = useState('');

  const trimmedSymbol = symbol.trim();
  const quantity = Number(quantityText);
  const hasValidQuantity = Number.isInteger(quantity) && quantity > 0;
  const currentHash = buildHash(trimmedSymbol, side, quantityText);

  const [storedEstimate, setStoredEstimate] = useState<StoredEstimate | null>(null);
  const [estimateErrorKey, setEstimateErrorKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OrderResultOutcome | null>(null);

  // §4: minted lazily before the first submit, held in a ref (not state) so
  // a click that slips past the `disabled` prop during a pending submit
  // (point G) synchronously reuses the same value instead of racing a state
  // update — the server then replays the original attempt instead of
  // placing a second order.
  const idempotencyKeyRef = useRef<string | null>(null);

  // A synchronous guard: `canConfirm`/`submitMutation.isPending` only flip
  // after a render, which is too late to stop two submits fired in the same
  // tick (a double-click, or a double Enter) from both reaching
  // `mutateAsync` — the idempotency key above being reused would then only
  // make the second request a replay of the first, not prevent it from being
  // sent at all. Mirrors CreatePortfolioForm.tsx's `submitting` ref.
  const submitting = useRef(false);

  // A 503/network failure deliberately KEEPS the key above so Retry reuses
  // it (see the catch block below) — but that must only survive an *unedited*
  // retry. If the user changes symbol/side/quantity after such a failure,
  // `currentHash` changes and this effect drops the stale key, so the next
  // submit mints a fresh one instead of carrying a key minted for values that
  // no longer match. The backend would otherwise catch this on its own
  // (409 IDEMPOTENCY_KEY_REUSED, handled below by rotating and re-asking),
  // so this isn't a correctness fix so much as skipping a forced round-trip.
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [currentHash]);

  const estimateMutation = useEstimateOrder(portfolioId);
  const submitMutation = useSubmitOrder(portfolioId);

  const canPreview =
    trimmedSymbol.length > 0 && hasValidQuantity && !estimateMutation.isPending && !submitMutation.isPending;
  // Point C: Confirm is gated on all three at once — an estimate must exist,
  // it must have been fetched for exactly today's symbol/side/quantity, and
  // no submit can already be in flight.
  const canConfirm =
    storedEstimate !== null && storedEstimate.hash === currentHash && !submitMutation.isPending;
  const isStale = storedEstimate !== null && storedEstimate.hash !== currentHash;

  async function handlePreview() {
    if (!canPreview) return;
    const hash = currentHash;
    setEstimateErrorKey(null);

    try {
      const result = await estimateMutation.mutateAsync({ symbol: trimmedSymbol, side, quantity });
      setStoredEstimate({ hash, estimate: result.data });
    } catch (error) {
      setStoredEstimate(null);
      setEstimateErrorKey(
        error instanceof ApiError ? mapOrderCode(error.body.code) : 'paperTrading.ticket.errors.unreachable',
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm || submitting.current) return;
    submitting.current = true;

    // Minted once per logical submission and kept across retries — see the
    // ref comment above and point D.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const result = await submitMutation.mutateAsync({
        symbol: trimmedSymbol,
        side,
        quantity,
        idempotencyKey: idempotencyKeyRef.current,
      });
      const order: Order = result.data;
      // §4: a 201 always stores the key server-side, whether the order came
      // back filled or rejected — either is a persisted, auditable result,
      // so this key must never be replayed again.
      idempotencyKeyRef.current = null;
      setOutcome({ kind: order.status === 'filled' ? 'filled' : 'rejected', order });
      setSymbol('');
      setQuantityText('');
      setStoredEstimate(null);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.body.code === 'IDEMPOTENCY_KEY_REUSED') {
          // The stored key was replayed against a different canonical
          // request. Rotate to a fresh key so the next attempt is a new
          // logical submission rather than another replay of the mismatch.
          idempotencyKeyRef.current = crypto.randomUUID();
        } else if (error.body.code === 'VALIDATION_FAILED' || error.body.code === 'PORTFOLIO_NOT_FOUND') {
          // §4: boundary validation failures are never stored server-side,
          // so there is nothing safe to replay — drop the key and let a
          // corrected submission mint its own.
          idempotencyKeyRef.current = null;
        }
        // 503 DEPENDENCY_UNAVAILABLE (and anything else, e.g. 401): the key
        // is deliberately KEPT so Retry reuses it — a transient dependency
        // failure creates no order, and reusing the key makes the retry the
        // same logical submission rather than a second one.
        setOutcome({ kind: 'error', messageKey: mapOrderCode(error.body.code) });
      } else {
        // A network failure never reached the server at all — keep the key
        // for the same reason as the 503 case above.
        setOutcome({ kind: 'error', messageKey: 'paperTrading.ticket.errors.unreachable' });
      }
    } finally {
      submitting.current = false;
    }
  }

  // Two columns on desktop, stacked on mobile: the form on the left stays
  // put while the estimate on the right updates, so Preview never pushes the
  // Confirm button out from under the pointer.
  return (
    <form className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2" onSubmit={handleSubmit}>
      <Card>
        <CardHeading title={t('paperTrading.ticket.title')} />

        <div className="flex flex-col gap-4 px-4 pb-4">
          {outcome && <ResultBanner outcome={outcome} />}

          <SymbolPicker
            value={symbol}
            onChange={(next) => {
              setSymbol(next);
              setOutcome(null);
            }}
            disabled={submitMutation.isPending}
          />

          <Field label={t('paperTrading.ticket.side')}>
            <select
              className={fieldShell}
              value={side}
              disabled={submitMutation.isPending}
              onChange={(event) => {
                setSide(event.target.value as OrderSide);
                setOutcome(null);
              }}
            >
              <option value="buy">{t('paperTrading.ticket.sides.buy')}</option>
              <option value="sell">{t('paperTrading.ticket.sides.sell')}</option>
            </select>
          </Field>

          <Field label={t('paperTrading.ticket.quantity')}>
            <input
              type="number"
              className={fieldShell}
              min={1}
              step={1}
              value={quantityText}
              disabled={submitMutation.isPending}
              onChange={(event) => {
                setQuantityText(event.target.value);
                setOutcome(null);
              }}
              required
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePreview} disabled={!canPreview}>
              {t('paperTrading.ticket.preview')}
            </Button>
            <Button type="submit" variant="primary" disabled={!canConfirm}>
              {t('paperTrading.ticket.confirm')}
            </Button>
          </div>
        </div>
      </Card>

      <EstimatePanel
        estimate={storedEstimate?.estimate ?? null}
        isPending={estimateMutation.isPending}
        isStale={isStale}
        errorKey={estimateErrorKey}
      />
    </form>
  );
}
