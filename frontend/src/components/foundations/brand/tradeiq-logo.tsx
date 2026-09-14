import { cx } from '@/utils/cx';

const sizes = {
  sm: 'size-8 rounded-lg',
  md: 'size-9 rounded-xl',
  lg: 'size-10 rounded-xl',
} as const;

interface TradeIqLogoProps {
  size?: keyof typeof sizes;
  className?: string;
}

/**
 * TradeIQ's market-lens mark: ascending candlesticks held inside an
 * analytical lens, with the lens tail forming a subtle "Q".
 */
export function TradeIqLogo({ size = 'md', className }: TradeIqLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden shadow-xs',
        sizes[size],
        className,
      )}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
      >
        <rect width="48" height="48" rx="14" className="fill-status-blue-background" />
        <path
          d="M0 35.5C9.4 29.4 14.2 28.9 22.6 31.4C31.4 34 38 28.6 48 17.5V48H0V35.5Z"
          className="fill-status-blue-text"
          opacity="0.1"
        />
        <path
          d="M4 9.5C14.4 3.8 28.8 2.9 43.5 8.2"
          className="stroke-status-blue-text"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.18"
        />
        <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="13.25" className="stroke-status-blue-text" strokeOpacity="0.24" strokeWidth="1.5" />

        <circle cx="23.5" cy="22.5" r="11.5" className="stroke-status-blue-text" strokeWidth="2.5" />
        <path d="M31.5 30.7L37.5 36.5" className="stroke-status-blue-text" strokeWidth="2.75" strokeLinecap="round" />

        <path d="M17.5 21V29" className="stroke-status-blue-text" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="15.5" y="23" width="4" height="4.75" rx="1" className="fill-status-blue-text" />
        <path d="M23.5 17.5V27" className="stroke-status-blue-text" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="21.5" y="20.25" width="4" height="4.5" rx="1" className="fill-status-blue-text" />
        <path d="M29.5 14.5V24" className="stroke-status-blue-text" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="27.5" y="17.25" width="4" height="4.75" rx="1" className="fill-status-blue-text" />
      </svg>
    </span>
  );
}
