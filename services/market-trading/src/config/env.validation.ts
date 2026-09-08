import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  MARKET_TRADING_PORT?: number;

  @IsString()
  @IsNotEmpty()
  MARKET_DATA_DATABASE_URL!: string;

  //: The access-token secret identity-auth signs with; the same JWT_SECRET both
  //: services read. Required, and required to match — a market-trading that
  //: boots without it would reject every authenticated request at runtime
  //: rather than failing here.
  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  //: Comma-separated browser origins allowed to call this API.
  @IsOptional()
  @IsString()
  MARKET_TRADING_CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  MARKET_INGESTION_TOKEN?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }
  return validatedConfig;
}
