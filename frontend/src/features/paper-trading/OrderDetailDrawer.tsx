import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { RiCheckboxCircleLine, RiCloseCircleLine } from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { Chip } from "../../components/base/badges/chip";
import { CloseButton } from "../../components/base/buttons/close-button";
import { localeFor } from "../../i18n";
import { formatDateTime, formatQuantity } from "./format";
import { Order } from "./types";
import { OrderDetail } from "./OrderDetail";

interface OrderDetailDrawerProps {
  portfolioId: string;
  order: Order | null;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * The list remains readable behind a focused detail surface. On phones the
 * surface rises from the bottom; from sm upward it reads as a right-hand
 * inspector. React Aria supplies focus trapping, Escape and outside-press
 * dismissal, and restores focus to the row action when the dialog closes.
 */
export function OrderDetailDrawer({
  portfolioId,
  order,
  onOpenChange,
}: OrderDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const StatusIcon =
    order?.status === "filled" ? RiCheckboxCircleLine : RiCloseCircleLine;

  return (
    <ModalOverlay
      isOpen={Boolean(order)}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-end bg-app-overlay sm:p-3"
    >
      <Modal className="max-h-[88dvh] w-full overflow-hidden rounded-t-3xl border border-border-table bg-background-primary-default shadow-dropdown outline-none sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-3xl">
        <Dialog className="flex h-full flex-col outline-none">
          {order && (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-separator-border p-4 sm:p-5">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Heading
                      slot="title"
                      className="text-title-2-medium text-text-primary"
                    >
                      {order.symbol}
                    </Heading>
                    <Chip
                      variant="subtle"
                      color={order.status === "filled" ? "lime" : "rose"}
                      className="gap-1"
                    >
                      <StatusIcon className="size-4" aria-hidden />
                      {t(`orders.status.${order.status}`)}
                    </Chip>
                  </div>
                  <p className="text-body-regular text-text-secondary">
                    {t("orders.detail.summary", {
                      side: t(`paperTrading.ticket.sides.${order.side}`),
                      quantity: formatQuantity(order.quantity, locale),
                      date: formatDateTime(order.placed_at, locale),
                    })}
                  </p>
                </div>
                <CloseButton
                  size="md"
                  aria-label={t("orders.detail.close")}
                  onClick={() => onOpenChange(false)}
                />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <OrderDetail
                  portfolioId={portfolioId}
                  orderId={order.order_id}
                />
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
