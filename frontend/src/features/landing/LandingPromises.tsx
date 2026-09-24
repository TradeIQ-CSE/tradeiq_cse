import { useTranslation } from 'react-i18next';
import { cx } from '@/utils/cx';

const PROMISES = ['free', 'noMoney', 'realData'] as const;

/**
 * "Free to use · No real money involved · Real CSE prices": the same line
 * under the hero buttons and in the closing call to action. Dots only where
 * the row fits on one line: when it wraps on a phone, a dot would start the
 * second line and pull it off-centre.
 */
export function LandingPromises({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <ul className={cx('flex flex-wrap justify-center gap-x-4 gap-y-1 text-body-2-medium text-text-secondary sm:gap-x-3', className)}>
      {PROMISES.map((key, index) => (
        <li key={key} className="flex items-center gap-3">
          {index > 0 && <span aria-hidden className="hidden text-text-tertiary sm:inline">·</span>}
          {t(`landing.hero.promises.${key}`)}
        </li>
      ))}
    </ul>
  );
}
