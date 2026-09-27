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

  //: Redis backs the hourly per-key rate-limit counters (SRS 3.6.1). Required
  //: so a missing or malformed URL fails at boot rather than surfacing later
  //: as every counter call throwing; the request path itself still fails open
  //: on a Redis that is reachable-but-down at runtime (ADR 0010).
  //: require_tld: false so a bare Compose service name (`redis://redis:6379`)
  //: or `localhost` validates, not just a fully-qualified host.
  @IsString()
  @IsNotEmpty()
  @IsUrl({
    protocols: ['redis', 'rediss'],
    require_tld: false,
    require_protocol: true,
  })
  REDIS_URL!: string;

  //: The public developer API's hourly per-key limit (SRS 3.1.3.3, 3.5.4).
  //: Optional — public-api.config.ts defaults it to 100 — but a value that is
  //: present must be a usable positive integer, not silently coerced to
  //: something the limiter would treat as "no limit" or reject at runtime.
  @IsOptional()
  @IsInt()
  @Min(1)
  PUBLIC_API_HOURLY_LIMIT?: number;
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
