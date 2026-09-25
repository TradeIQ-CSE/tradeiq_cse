import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RiCheckboxCircleLine, RiFileList3Line } from "@remixicon/react";
import { ApiError } from "../../lib/api";
import { EstimatePanel } from "./EstimatePanel";
import { mapOrderCode } from "./order-messages";
import { OrderResultOutcome, ResultBanner } from "./ResultBanner";
import { SymbolPicker } from "./SymbolPicker";
import { Order, OrderEstimate, OrderSide } from "./types";
import { useEstimateOrder, useSubmitOrder } from "./useOrders";
import { Button } from "../../components/base/buttons/button";
import { Input } from "../../components/base/input/input";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/base/segmented-control/segmented-control";
import { InfoTip } from "../../components/domain/info-tip";
import { Stepper } from "../../components/application/stepper";
import { Card, CardHeading } from "./ui";
import { cx } from '@/utils/cx';

interface OrderTicketProps {
  portfolioId: string;
  mode?: 'simple' | 'advanced';
  onBusyChange?: (busy: boolean) => void;
  /** Company to start with, e.g. from a company page's "Practise a trade". */
  initialSymbol?: string;
}

interface StoredEstimate {
  hash: string;
  revision: number;
  estimate: OrderEstimate;
}

// Point C: the hash a Confirm click is gated on. Built from the raw quantity
// *text*, not a parsed number — every keystroke, including one that makes
// the field momentarily invalid, changes the hash, so there is no window
// where an edited-but-not-yet-revalidated quantity could still match a
// stale estimate. A field added later only has to be folded into this one
// function for the gate to keep working; it is never bypassed by forgetting
// to wire up an onChange handler that clears stored state by hand.
function buildHash(
  portfolioId: string,
  symbol: string,
  side: OrderSide,
  quantityText: string,
): string {
  return JSON.stringify([portfolioId, symbol, side, quantityText]);
}

export function OrderTicket({ portfolioId, mode = 'advanced', onBusyChange, initialSymbol }: OrderTicketProps) {
  const { t } = useTranslation();
  const simple = mode === 'simple';
  const guidanceId = useId();
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [side, setSide] = useState<OrderSide>("buy");
  const [quantityText, setQuantityText] = useState("");

  const trimmedSymbol = symbol.trim();
  const quantity = Number(quantityText);
  const hasValidQuantity = Number.isInteger(quantity) && quantity > 0;
  const currentHash = buildHash(portfolioId, trimmedSymbol, side, quantityText);
  const activeHash = useRef(currentHash);
  const revision = useRef(0);
  if (activeHash.current !== currentHash) revision.current += 1;
  activeHash.current = currentHash;

  const [storedEstimate, setStoredEstimate] = useState<StoredEstimate | null>(
    null,
  );
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
  const previewing = useRef(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    onBusyChange?.(estimateMutation.isPending || submitMutation.isPending);
    return () => onBusyChange?.(false);
  }, [estimateMutation.isPending, submitMutation.isPending, onBusyChange]);
  useEffect(() => {
    setEstimateErrorKey(null);
  }, [currentHash]);
  useEffect(() => { setOutcome(null); }, [portfolioId]);

  const canPreview =
    trimmedSymbol.length > 0 &&
    hasValidQuantity &&
    !estimateMutation.isPending &&
    !submitMutation.isPending;
  // Point C: Confirm is gated on all three at once — an estimate must exist,
  // it must have been fetched for exactly today's symbol/side/quantity, and
  // no submit can already be in flight.
  // A revision prevents changing away and back (including account A -> B -> A)
  // from resurrecting a previously invalidated preview or a late response.
  const matchesEstimate =
    storedEstimate !== null &&
    storedEstimate.hash === currentHash &&
    storedEstimate.revision === revision.current;
  const canConfirm = matchesEstimate &&
    !estimateMutation.isPending &&
    !submitMutation.isPending;
  const isStale =
    storedEstimate !== null && !matchesEstimate;
  const hasReview = Boolean(storedEstimate || estimateMutation.isPending || estimateErrorKey);
  const currentStep = matchesEstimate && !estimateMutation.isPending ? 3
    : trimmedSymbol && hasValidQuantity ? 2 : 1;
  const guidanceKey = submitMutation.isPending ? 'confirming'
    : estimateMutation.isPending ? 'reviewing'
    : !trimmedSymbol && !hasValidQuantity ? 'missingBoth'
    : !trimmedSymbol ? 'missingCompany'
    : !hasValidQuantity ? 'missingShares'
    : matchesEstimate ? 'readyToConfirm' : 'readyToReview';
  useEffect(() => {
    if (!storedEstimate || estimateMutation.isPending || !matchesEstimate) return;
    reviewRef.current?.focus({ preventScroll: true });
    reviewRef.current?.scrollIntoView?.({ block: 'start' });
  }, [storedEstimate, estimateMutation.isPending, matchesEstimate]);
  useEffect(() => {
    if (!outcome) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView?.({ block: 'start' });
  }, [outcome]);

  async function handlePreview() {
    if (!canPreview || previewing.current || submitting.current) return;
    previewing.current = true;
    const hash = currentHash;
    const requestedRevision = revision.current;
    setEstimateErrorKey(null);

    try {
      const result = await estimateMutation.mutateAsync({
        symbol: trimmedSymbol,
        side,
        quantity,
      });
      setStoredEstimate({ hash, revision: requestedRevision, estimate: result.data });
    } catch (error) {
      if (activeHash.current !== hash) return;
      setStoredEstimate(null);
      setEstimateErrorKey(
        error instanceof ApiError
          ? mapOrderCode(error.body.code)
          : "paperTrading.ticket.errors.unreachable",
      );
    } finally {
      previewing.current = false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in a fresh Simple ticket reviews it; it cannot submit without a
    // matching estimate. Review and confirmation remain separate API actions.
    if (simple && !canConfirm) {
      await handlePreview();
      return;
    }
    if (!canConfirm || submitting.current || previewing.current) return;
    submitting.current = true;
    const submittedHash = currentHash;

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
      if (activeHash.current !== submittedHash) return;
      setOutcome({
        kind: order.status === "filled" ? "filled" : "rejected",
        order,
      });
      setSymbol("");
      setQuantityText("");
      setStoredEstimate(null);
    } catch (error) {
      if (activeHash.current !== submittedHash) return;
      if (error instanceof ApiError) {
        if (error.body.code === "IDEMPOTENCY_KEY_REUSED") {
          // The stored key was replayed against a different canonical
          // request. Rotate to a fresh key so the next attempt is a new
          // logical submission rather than another replay of the mismatch.
          idempotencyKeyRef.current = crypto.randomUUID();
        } else if (
          error.body.code === "VALIDATION_FAILED" ||
          error.body.code === "PORTFOLIO_NOT_FOUND"
        ) {
          // §4: boundary validation failures are never stored server-side,
          // so there is nothing safe to replay — drop the key and let a
          // corrected submission mint its own.
          idempotencyKeyRef.current = null;
        }
        // 503 DEPENDENCY_UNAVAILABLE (and anything else, e.g. 401): the key
        // is deliberately KEPT so Retry reuses it — a transient dependency
        // failure creates no order, and reusing the key makes the retry the
        // same logical submission rather than a second one.
        setOutcome({
          kind: "error",
          messageKey: mapOrderCode(error.body.code),
        });
      } else {
        // A network failure never reached the server at all — keep the key
        // for the same reason as the 503 case above.
        setOutcome({
          kind: "error",
          messageKey: "paperTrading.ticket.errors.unreachable",
        });
      }
    } finally {
      submitting.current = false;
    }
  }

  // Keep the same component positions in both modes so layout changes never
  // reset input/disclosure state. Simple starts compact, then makes room for
  // the cost review beside it on desktop (stacked on smaller screens).
  return (
    <form
      className={cx('grid w-full grid-cols-1 items-stretch gap-5',
        simple && 'mx-auto max-w-2xl',
        simple && hasReview && 'max-w-6xl',
        (!simple || hasReview) && 'lg:grid-cols-2')}
      onSubmit={handleSubmit}
    >
      <div hidden={!simple} className="col-span-full">
        <Stepper
          label={t('paperTrading.workflow.steps.label')}
          steps={(['choose', 'review', 'confirm'] as const).map((step, index) => ({
            key: step,
            label: t(`paperTrading.workflow.steps.${step}`),
            state: currentStep === index + 1 ? 'current' : currentStep > index + 1 ? 'complete' : 'upcoming',
          }))}
        />
      </div>
      <Card className="flex min-w-0 flex-col">
        <CardHeading title={t("paperTrading.ticket.title")}
          info={t("paperTrading.ticket.guide.body")} />

        <div className="flex flex-1 flex-col gap-5 px-4 pb-4 sm:px-5 sm:pb-5">
          {outcome && <div ref={resultRef} tabIndex={-1} className="outline-none"><ResultBanner outcome={outcome} /></div>}

          <SymbolPicker
            label={simple ? t('paperTrading.workflow.company') : undefined}
            showCompanyName
            value={symbol}
            onChange={(next) => {
              setSymbol(next);
              setOutcome(null);
            }}
            disabled={submitMutation.isPending}
          />

          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-body-medium text-text-primary">
              {t(simple ? 'paperTrading.workflow.action' : "paperTrading.ticket.side")}
              <InfoTip label={t("paperTrading.ticket.side")}>
                {t(`paperTrading.ticket.sideHelp.${side}`)}
              </InfoTip>
            </span>
            <SegmentedControl
              aria-label={t("paperTrading.ticket.side")}
              className="grid w-full grid-cols-2"
              selectedKeys={new Set([side])}
              isDisabled={submitMutation.isPending}
              onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (!next) return;
                setSide(next as OrderSide);
                setOutcome(null);
              }}
            >
              <SegmentedControlItem id="buy">
                {t("paperTrading.ticket.sides.buy")}
              </SegmentedControlItem>
              <SegmentedControlItem id="sell">
                {t("paperTrading.ticket.sides.sell")}
              </SegmentedControlItem>
            </SegmentedControl>
          </div>

          <Input
            label={t(simple ? 'paperTrading.workflow.shareCount' : "paperTrading.ticket.quantity")}
            type="number"
            min={1}
            step={1}
            value={quantityText}
            isDisabled={submitMutation.isPending}
            isRequired
            fieldClassName="ring-1 ring-inset ring-border-button-default"
            onChange={(value) => {
              setQuantityText(value);
              setOutcome(null);
            }}
          />

          {/* Pinned to the bottom so it lines up with Confirm in the cost card. */}
          <div className="mt-auto flex flex-col gap-2">
          <p id={guidanceId} hidden={!simple} aria-live="polite"
            className="text-body-2-regular text-text-secondary">
            {t(`paperTrading.workflow.guidance.${guidanceKey}`)}
          </p>
          <div className={cx('grid grid-cols-1 gap-2', !simple && 'sm:grid-cols-2')}>
            <Button
              type={simple && !matchesEstimate ? 'submit' : 'button'}
              // Once the cost is shown, Confirm is the one primary action.
              variant={simple && !matchesEstimate ? 'primary' : 'secondary'}
              leadingIcon={RiFileList3Line}
              onClick={simple && !matchesEstimate ? undefined : handlePreview}
              disabled={!canPreview}
              aria-describedby={simple ? guidanceId : undefined}
            >
              {t(simple ? 'paperTrading.workflow.reviewTrade' : "paperTrading.ticket.preview")}
            </Button>
            {!simple && <Button
              type="submit"
              variant="primary"
              leadingIcon={RiCheckboxCircleLine}
              disabled={!canConfirm}
            >
              {t("paperTrading.ticket.confirm")}
            </Button>
            }
          </div>
          </div>

        </div>
      </Card>

      <div ref={reviewRef} tabIndex={-1} className="min-w-0 scroll-mt-24 outline-none [&>section]:h-full"
        role="region" aria-label={t('paperTrading.workflow.tradeReview')}
        hidden={simple && !storedEstimate && !estimateMutation.isPending && !estimateErrorKey}>
      <EstimatePanel
        simple={simple}
        estimate={storedEstimate?.estimate ?? null}
        isPending={estimateMutation.isPending}
        isStale={isStale}
        errorKey={estimateErrorKey}
        confirmation={simple && matchesEstimate && !estimateMutation.isPending ? (
          <Button type="submit" variant="primary" className="w-full"
            leadingIcon={RiCheckboxCircleLine} disabled={!canConfirm}>
            {t(`paperTrading.workflow.confirm.${side}`)}
          </Button>
        ) : undefined}
      />
      </div>
    </form>
  );
}
