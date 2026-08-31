import { IsUUID } from 'class-validator';

// Path params for the order routes. Validated as DTOs so a malformed uuid is
// 400 VALIDATION_FAILED (§9.1) rather than falling through to a 404 miss.
export class PortfolioIdParamDto {
  @IsUUID()
  portfolioId!: string;
}

export class OrderParamsDto {
  @IsUUID()
  portfolioId!: string;

  @IsUUID()
  orderId!: string;
}
