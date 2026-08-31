import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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
  IDENTITY_AUTH_PORT?: number;

  @IsString()
  @IsNotEmpty()
  AUTH_DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  //: Base URL of the market-trading service, used for execution quotes.
  @IsOptional()
  // require_tld is off because compose injects http://market-trading:3001,
  // a hostname with no TLD. The scheme is still required: without it a value
  // like "market-trading:3001" would validate and then build a broken URL.
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  MARKET_TRADING_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  MARKET_TRADING_TIMEOUT_MS?: number;
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
