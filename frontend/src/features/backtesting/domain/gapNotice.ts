import {
  DataGap,
  firstSessionAfterGap,
  formatGapBoundary,
  formatGapProseRange,
} from '../../../lib/data-gaps';

/**
 * The crossing notice shown under the period picker and repeated on the
 * review step when the chosen range crosses a `missing_data` gap with data
 * on both ends (docs/plans/data-gap-handling.md §5). The engine holds an
 * open position through the gap and evaluates no stop-loss/take-profit rule
 * until trading resumes, so the notice names exactly when that is — the
 * first session after the gap.
 */
export function crossingNoticeLines(gap: DataGap, locale: string): string[] {
  const range = formatGapProseRange(gap, locale);
  const resumes = formatGapBoundary(firstSessionAfterGap(gap), locale);
  return [
    range,
    'Shares you hold are kept through it',
    `Sell rules wait until ${resumes}`,
  ];
}
