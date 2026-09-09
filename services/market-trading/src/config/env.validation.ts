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
import { IsAccessTokenPublicKeyRing } from './jwt-keys';

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

  //: The public keys access tokens are verified against, comma-separated
  //: base64-encoded SPKI PEMs. Required, and required to include whichever key
  //: identity-auth is signing with — a market-trading that boots without a
  //: usable key would reject every authenticated request at runtime rather
  //: than failing here. No private key appears in this service's environment,
  //: so nothing it holds can mint a token (docs/api/auth-v1.md §8).
  @IsString()
  @IsNotEmpty()
  @IsAccessTokenPublicKeyRing()
  AUTH_JWT_PUBLIC_KEYS!: string;

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
