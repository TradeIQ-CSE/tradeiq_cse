import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../../components/base/buttons/button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
  /** Danger styling for the confirm button — Revoke, not Regenerate. */
  destructive?: boolean;
}

/**
 * The one confirmation dialog for Regenerate and Revoke. Controlled directly
 * (isOpen/onOpenChange), matching the pattern already used for the mobile nav
 * drawer (AppShell.tsx) and DesignSystemPreview's own confirm example: a
 * plain BoardUI Button doesn't wire up as a DialogTrigger's clonable child,
 * so ModalOverlay is driven from the caller's own open state instead.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  isPending,
  destructive,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay p-4"
    >
      <Modal className="w-full max-w-sm rounded-3xl border border-border-table bg-background-primary-default p-5 shadow-lg outline-none">
        <Dialog className="outline-none">
          <Heading slot="title" className="text-title-2-semibold text-text-primary">
            {title}
          </Heading>
          <p className="mt-2 text-body-regular text-text-secondary">{description}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={isPending}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
