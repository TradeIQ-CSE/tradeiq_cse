import { IsUUID } from 'class-validator';

// :portfolioId path param on every /portfolios/:portfolioId route. Validated
// as a DTO (not a bare @Param(string)) so an invalid UUID reports
// 400 VALIDATION_FAILED per docs/api/paper-trading-v1.md §9.1, rather than
// falling through to a 404 lookup miss.
export class PortfolioIdParamDto {
  @IsUUID()
  portfolioId!: string;
}
