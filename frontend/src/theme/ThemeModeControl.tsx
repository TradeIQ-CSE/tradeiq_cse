import { RiComputerLine, RiMoonLine, RiSunLine } from '@remixicon/react';
import { cx } from '../utils/cx';
import { ThemePreference, useTheme } from './useTheme';

const OPTIONS: { preference: ThemePreference; label: string; Icon: typeof RiSunLine }[] = [
  { preference: 'light', label: 'Light', Icon: RiSunLine },
  { preference: 'dark', label: 'Dark', Icon: RiMoonLine },
  { preference: 'system', label: 'System', Icon: RiComputerLine },
];

export interface ThemeModeControlProps {
  className?: string;
  compact?: boolean;
}

/** Light, dark, and system segmented theme picker. */
export function ThemeModeControl({ className, compact = false }: ThemeModeControlProps) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cx(
        'inline-grid grid-cols-3 items-center gap-1 rounded-2lg bg-background-secondary-default p-1',
        className,
      )}
    >
      {OPTIONS.map(({ preference: optionPreference, label, Icon }) => {
        const selected = preference === optionPreference;
        return (
          <button
            key={optionPreference}
            type="button"
            role="radio"
            aria-checked={selected}
            title={label}
            onClick={(event) => {
              if (selected) return;
              const origin =
                event.clientX === 0 && event.clientY === 0
                  ? null
                  : { x: event.clientX, y: event.clientY };
              setPreference(optionPreference, origin);
            }}
            className={cx(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5',
              'text-body-medium transition-colors duration-150 ease',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
              selected
                ? 'bg-background-primary-default text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className={cx(compact && 'sr-only')}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
