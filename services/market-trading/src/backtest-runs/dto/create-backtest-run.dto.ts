import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validation/is-calendar-date';

export class RuleConditionDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsNumber()
  value?: number;
}

export class RuleConfigDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => RuleConditionDto)
  buy!: RuleConditionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  sell!: RuleConditionDto[];
}

export class FeeConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  brokerageRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cseRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cdsRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  secCessRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stlRate?: number;
}

export class PositionSizingDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsNumber()
  value?: number;
}

export class CreateBacktestRunDto {
  @IsString()
  symbol!: string;

  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  startDate!: string;

  @IsCalendarDate({
    message: 'must be a calendar date in YYYY-MM-DD form',
  })
  endDate!: string;

  @IsNumber()
  @IsPositive()
  startingCapital!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => RuleConfigDto)
  rule!: RuleConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig?: FeeConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionSizingDto)
  positionSizing?: PositionSizingDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  warmupPeriod?: number;
}
