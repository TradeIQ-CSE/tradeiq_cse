import { ReactNode, useId, useState } from 'react';
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';

/** Disclosure composed from the installed BoardUI Button. Children stay mounted
 * so changing presentation or closing a panel never resets editable fields. */
export function TradingDetails({ title, children, expanded = false, disabled = false, className }: {
  title: string;
  children: ReactNode;
  expanded?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const visible = expanded || open;
  return (
    <div className={cx('flex min-w-0 flex-col gap-3', className)}>
      {!expanded && (
        <Button type="button" variant="secondary" className="self-start"
          trailingIcon={open ? RiArrowUpSLine : RiArrowDownSLine}
          aria-expanded={visible} aria-controls={id} disabled={disabled}
          onClick={() => setOpen(!open)}>
          {title}
        </Button>
      )}
      <div id={id} hidden={!visible}>{children}</div>
    </div>
  );
}
