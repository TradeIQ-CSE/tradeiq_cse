import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'securities', schema: 'market_data' })
export class Security {
  @PrimaryColumn({ name: 'security_id', type: 'uuid' })
  securityId!: string;

  @Column({ name: 'symbol', type: 'varchar', length: 20, unique: true })
  symbol!: string;

  @Column({ name: 'cse_code', type: 'varchar', length: 30, nullable: true })
  cseCode?: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName!: string;

  @Column({ name: 'sector_id', type: 'uuid', nullable: true })
  sectorId?: string;

  @Column({ name: 'shares_outstanding', type: 'bigint', nullable: true })
  sharesOutstanding?: string;

  @Column({ name: 'data_from', type: 'date', nullable: true })
  dataFrom?: string;

  @Column({ name: 'data_to', type: 'date', nullable: true })
  dataTo?: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
