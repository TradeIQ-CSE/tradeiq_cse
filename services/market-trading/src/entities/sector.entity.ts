import { Column, Entity, PrimaryColumn } from 'typeorm';

// Maps market_data.sectors (services/market-trading/migrations/1786358400000-InitialSchema.ts)
@Entity({ schema: 'market_data', name: 'sectors' })
export class Sector {
  @PrimaryColumn('uuid', { name: 'sector_id' })
  sectorId!: string;

  @Column('varchar', { name: 'gics_code', length: 10, unique: true })
  gicsCode!: string;

  @Column('varchar', { name: 'sector_name', length: 100 })
  sectorName!: string;
}
