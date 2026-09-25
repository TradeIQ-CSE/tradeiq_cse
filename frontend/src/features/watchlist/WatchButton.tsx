import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { RiStarFill, RiStarLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { useAuth } from '../../auth/useAuth';
import { cx } from '../../utils/cx';
import { useAddToWatchlist, useRemoveFromWatchlist, useWatchlist } from './useWatchlist';

interface WatchButtonProps {
  symbol: string;
  /** "icon" for table rows; "label" adds the words Follow / Following. */
  appearance?: 'icon' | 'label';
  className?: string;
}

/**
 * The one star used everywhere a company can be followed. A guest is sent to
 * sign in and brought back; a full list disables the star with the reason.
 */
export function WatchButton({ symbol, appearance = 'icon', className }: WatchButtonProps) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: watchlist } = useWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();

  const onList = watchlist?.items.some((item) => item.symbol === symbol) ?? false;
  const adding = add.isPending && add.variables === symbol;
  const watched = onList || adding;
  const full = !watched && !!watchlist && watchlist.items.length >= watchlist.limit;
  const failed = add.isError && add.variables === symbol;

  const label = full
    ? t('watchlistPage.watch.full')
    : t(watched ? 'watchlistPage.watch.remove' : 'watchlistPage.watch.add', { symbol });

  function toggle() {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: location } });
      return;
    }
    if (watched) remove.mutate(symbol);
    else add.mutate(symbol);
  }

  const icon = watched ? RiStarFill : RiStarLine;
  const tone = watched ? 'text-status-yellow-text' : undefined;

  return (
    // The wrapper carries the tooltip: a disabled button shows none.
    <span className={cx('inline-flex', className)} title={failed ? t('watchlistPage.watch.failed') : label}>
      {appearance === 'icon' ? (
        <Button
          variant="ghost"
          size="small"
          iconOnly
          leadingIcon={icon}
          onClick={toggle}
          disabled={full || status === 'restoring' || adding}
          aria-pressed={watched}
          aria-label={label}
          className={tone}
        />
      ) : (
        <Button
          variant="secondary"
          leadingIcon={icon}
          onClick={toggle}
          disabled={full || status === 'restoring' || adding}
          aria-pressed={watched}
          aria-label={label}
          className={cx(watched && '[&_svg]:text-status-yellow-text')}
        >
          {t(watched ? 'watchlistPage.watch.following' : 'watchlistPage.watch.follow')}
        </Button>
      )}
    </span>
  );
}
