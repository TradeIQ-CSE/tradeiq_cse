import { useSecurities } from '../markets/useSecurities';
import { SecurityListItem } from '../markets/types';
import { PREVIEW_FALLBACK } from './preview-fallback';

export const PREVIEW_COUNT = 5;

/**
 * Which of the two sources the rows on screen came from.
 *
 * The caller must render this, not just consume it: `live` rows carry a real
 * session date and `sample` rows carry none, and a viewer has to be able to
 * tell the two apart. Collapsing them into one indistinguishable table is the
 * whole thing this exists to prevent.
 */
export type PreviewSource = 'live' | 'sample';

export interface MarketPreview {
  securities: SecurityListItem[];
  source: PreviewSource;
  /** The session the figures describe. Null for the sample, always. */
  asOf: string | null;
  /** Total listed securities, or null when that number is not known. */
  total: number | null;
  isPending: boolean;
}

/**
 * The landing page's securities preview, with a fallback.
 *
 * Reads the same public GET /securities the Markets screen uses. If that call
 * fails, the section still renders — a first-time visitor should not meet an
 * error strip — but from PREVIEW_FALLBACK and flagged as a sample.
 *
 * A successful response with zero rows is treated as a failure for this
 * purpose. It is a legitimate API result, but an empty table on a landing page
 * says nothing about the product, and the fallback is a better answer than a
 * blank card.
 *
 * `total` stays null on the sample path: the fallback is five fixed rows and
 * has no idea how many securities are actually listed, and "5 securities
 * listed on the CSE" would be a worse lie than showing no count at all.
 */
export function useMarketPreview(): MarketPreview {
  const { data, isPending, isError } = useSecurities({
    sort: 'symbol',
    page: 1,
    page_size: PREVIEW_COUNT,
  });

  const live = data?.data ?? [];

  if (isError || (!isPending && live.length === 0)) {
    return {
      securities: PREVIEW_FALLBACK,
      source: 'sample',
      asOf: null,
      total: null,
      isPending: false,
    };
  }

  return {
    securities: live,
    source: 'live',
    asOf: data?.meta?.as_of ?? null,
    total: data?.meta?.total ?? null,
    isPending,
  };
}
