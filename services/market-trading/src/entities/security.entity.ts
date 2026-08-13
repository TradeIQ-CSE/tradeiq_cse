import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Sector } from './sector.entity';

// Maps market_data.securities (services/market-trading/migrations/1786358400000-InitialSchema.ts)
@Entity({ schema: 'market_data', name: 'securities' })
export class Security {
  @PrimaryColumn('uuid', { name: 'security_id' })
  securityId!: string;

  @Column('varchar', { name: 'symbol', length: 20, unique: true })
  symbol!: string;

  @Column('varchar', { name: 'cse_code', length: 30, nullable: true })
  cseCode!: string | null;

  @Column('varchar', { name: 'company_name', length: 200 })
  companyName!: string;

  @Column('uuid', { name: 'sector_id', nullable: true })
  sectorId!: string | null;

  @ManyToOne(() => Sector, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector!: Sector | null;

  @Column('bigint', { name: 'shares_outstanding', nullable: true })
  sharesOutstanding!: string | null;

  @Column('date', { name: 'data_from', nullable: true })
  dataFrom!: string | null;

  @Column('date', { name: 'data_to', nullable: true })
  dataTo!: string | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}
