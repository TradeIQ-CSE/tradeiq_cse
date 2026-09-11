import {
  RiBankLine,
  RiBuilding4Line,
  RiBuildingLine,
  RiComputerLine,
  RiBuilding2Line,
  RiHeartPulseLine,
  RiLightbulbFlashLine,
  RiOilLine,
  RiShoppingBag3Line,
  RiSignalTowerLine,
  RiStore2Line,
  RiTestTubeLine,
} from '@remixicon/react';
import { cx } from '@/utils/cx';
import type { Sector } from './types';

const SECTOR_ICONS = {
  '10': RiOilLine,
  '15': RiTestTubeLine,
  '20': RiBuilding2Line,
  '25': RiShoppingBag3Line,
  '30': RiStore2Line,
  '35': RiHeartPulseLine,
  '40': RiBankLine,
  '45': RiComputerLine,
  '50': RiSignalTowerLine,
  '55': RiLightbulbFlashLine,
  '60': RiBuilding4Line,
} as const;

export interface SecuritySectorIconProps {
  sector: Sector | null;
  className?: string;
}

/** A sector cue, not an unofficial recreation of a listed company's logo. */
export function SecuritySectorIcon({ sector, className }: SecuritySectorIconProps) {
  const category = sector?.gics_code.slice(0, 2) ?? 'unknown';
  const Icon = SECTOR_ICONS[category as keyof typeof SECTOR_ICONS] ?? RiBuildingLine;
  const label = sector ? `${sector.name} sector` : 'Listed company';

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-sector-category={category}
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-xl',
        'border border-border-button-default bg-background-secondary-default',
        'text-status-blue-text',
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}
