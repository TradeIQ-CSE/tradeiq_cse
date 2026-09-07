import { useState } from 'react';
import { Dialog, Focusable, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { RiAddLine, RiSettings3Line } from '@remixicon/react';
import { Button } from '../components/base/buttons/button';
import { Input } from '../components/base/input/input';
import {
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '../components/base/dropdown/dropdown';
import { Tooltip, TooltipTrigger } from '../components/base/tooltip/tooltip';
import { Chip } from '../components/base/badges/chip';
import { Badge } from '../components/base/badges/badge';

/**
 * Not a route — a source-level rendering of the Phase 1 component set
 * (docs/plans/frontend-boardui-refresh.md) so it can be exercised by tests
 * and eyeballed locally without wiring anything into AppRoutes.
 */
export function DesignSystemPreview() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 bg-background-primary-default p-6 text-text-primary">
      <section aria-label="Buttons" className="flex flex-wrap items-center gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </section>

      <section aria-label="Inputs" className="flex max-w-sm flex-col gap-3">
        <Input label="Symbol" placeholder="e.g. COMB.N0000" />
        <Input label="Symbol" value="NOT-A-SYMBOL" isInvalid hint="Symbol not found" />
      </section>

      {/* Card pattern: a bordered, elevated surface — BoardUI has no
          dedicated Card primitive, this is the composition itself. */}
      <section
        aria-label="Card"
        className="max-w-sm rounded-2lg border border-border-table bg-background-secondary-default p-4"
      >
        <p className="text-text-secondary">Portfolio value</p>
        <p className="text-title-2-semibold">LKR 1,245,300</p>
      </section>

      {/*
        Plain HTML here, not react-aria-components' Table/TableHeader/…
        collection primitives (@/components/base/table/table): under React 19
        those throw "Cell count must match column count. Found N cells and 0
        columns" on mount, reproduced with BoardUI's own unmodified usage
        example, in both jsdom and a real Chrome build (react-aria-components
        1.21.1, react-aria 3.52.1, the current latest of both). BoardUI's
        `.bui-table` CSS targets plain table/th/td markup for exactly this
        reason ("React Aria renders real <table>… elements", see
        styles/globals.css) so this looks identical. Revisit once upstream
        fixes it — affects the Phase 3 Markets table and BoardUI's data-table
        block too, both built on the same primitives.
      */}
      <section aria-label="Table">
        <table className="bui-table" aria-label="Securities preview">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Price</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>COMB.N0000</td>
              <td>142.72</td>
              <td>
                <Chip variant="bold" color="lime">
                  +1.23%
                </Chip>
              </td>
            </tr>
            <tr>
              <td>SAMP.N0000</td>
              <td>80.19</td>
              <td>
                <Chip variant="bold" color="rose">
                  -1.15%
                </Chip>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-label="Status chips and badge" className="flex items-center gap-3">
        <Chip variant="bold" color="lime">
          Filled
        </Chip>
        <Chip variant="bold" color="rose">
          Rejected
        </Chip>
        <Chip variant="subtle" color="cyan">
          Pending
        </Chip>
        <Badge color="neutral">3</Badge>
      </section>

      <section aria-label="Tooltip">
        <TooltipTrigger delay={0}>
          <Focusable>
            <Button variant="secondary" leadingIcon={RiSettings3Line}>
              Settings
            </Button>
          </Focusable>
          <Tooltip>Manage account settings</Tooltip>
        </TooltipTrigger>
      </section>

      <section aria-label="Menu">
        <Dropdown isOpen={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownTrigger
            aria-label="Row actions"
            className="flex size-9 items-center justify-center rounded-full bg-background-secondary-default"
          >
            <RiAddLine className="size-5" aria-hidden />
          </DropdownTrigger>
          <DropdownPopover aria-label="Row actions menu" className="w-56 p-2">
            <DropdownGroup label="Actions">
              <DropdownItem onSelect={() => setMenuOpen(false)}>Add to watchlist</DropdownItem>
              <DropdownItem onSelect={() => setMenuOpen(false)}>View details</DropdownItem>
            </DropdownGroup>
          </DropdownPopover>
        </Dropdown>
      </section>

      {/*
        No <DialogTrigger> here: it clones press handling onto its trigger
        child, which works for react-aria-components' own <Button> but not a
        plain native one — BoardUI's Button — even wrapped in <Focusable>
        (that's enough for TooltipTrigger's hover/focus wiring, not
        DialogTrigger's click-to-open). Controlling ModalOverlay directly
        sidesteps that; it supports isOpen/onOpenChange standalone for
        exactly this case.
      */}
      <section aria-label="Dialog">
        <Button variant="primary" onClick={() => setDialogOpen(true)}>
          Confirm order
        </Button>
        <ModalOverlay
          isOpen={dialogOpen}
          onOpenChange={setDialogOpen}
          isDismissable
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <Modal className="w-full max-w-sm rounded-2lg border border-border-table bg-background-primary-default p-5">
            <Dialog className="outline-none">
              <Heading slot="title" className="text-title-2-semibold">
                Confirm order
              </Heading>
              <p className="mt-2 text-text-secondary">
                Buy 100 shares of COMB.N0000 at market price.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Confirm
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      </section>
    </div>
  );
}
