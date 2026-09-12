import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/utils/cx';
import './aurora-background.css';

interface AuroraBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div className={cx('aurora-background relative isolate overflow-hidden', className)} {...props}>
      <div
        aria-hidden="true"
        className={cx(
          'aurora-background__glow pointer-events-none absolute inset-0',
          showRadialGradient && 'aurora-background__glow--radial',
        )}
      >
        <span className="aurora-background__field aurora-background__field--north" />
        <span className="aurora-background__field aurora-background__field--east" />
        <span className="aurora-background__field aurora-background__field--south" />
      </div>
      {children}
    </div>
  );
};
