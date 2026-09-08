import { plainToInstance } from 'class-transformer';
import {
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { StrongInProduction } from './jwt-secret.validator';

// docs/api/auth-v1.md §8 — a token lifetime. Requires a unit of a second or
// longer, and a value above zero, because jsonwebtoken hands a bare string to
// `ms()`:
//
//   "5m"   -> 300 seconds        as intended
//   "300"  -> 0.3 seconds        read as milliseconds, so the token is dead
//   "5min" -> 0.005 seconds      "min" is not a unit ms knows
//   "0"    -> 0 seconds          expires at the instant it is issued
//
// Each passes a laxer check and then fails silently at runtime, with
// `expires_in` still reporting the number the operator meant.
//
// `ms` is excluded rather than merely bounded. Anything under half a second
// rounds to a zero-second lifetime, which for the refresh token makes
// expires_at equal issued_at and trips refresh_tokens_expiry_chk — signup
// answers 500. Nobody wants a sub-second session, and allowing the unit only
// re-opens the millisecond confusion this rule exists to prevent.
//
// Five digits is also the ceiling, so the far end cannot overflow. 99999y is
// 3.2e15 ms, inside the 8.6e15 ms a Date can hold; an unbounded run of digits
// becomes Infinity and yields an Invalid Date expiry, failing at the first
// signup instead of here at boot. Nothing legitimate needs more.
const DURATION = /^[1-9]\d{0,4}(s|m|h|d|w|y)$/;

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

  // The HS256 key this service signs access tokens with, and the one
  // market-trading verifies them with. Anyone holding it can mint a token for
  // any user id, so @StrongInProduction rejects the shipped development
  // default and anything too short to be a real key once NODE_ENV=production.
  @IsString()
  @IsNotEmpty()
  @StrongInProduction()
  JWT_SECRET!: string;

  @IsOptional()
  @Matches(DURATION)
  AUTH_ACCESS_TOKEN_TTL?: string;

  @IsOptional()
  @Matches(DURATION)
  AUTH_REFRESH_TOKEN_TTL?: string;

  // 32 raw bytes, base64 encoded: the AES-256-GCM key for auth.users
  // .email_encrypted and the HMAC key behind email_hash (docs/api/auth-v1.md §5).
  @IsBase64()
  AUTH_EMAIL_ENCRYPTION_KEY!: string;

  @IsOptional()
  @IsBoolean()
  AUTH_REFRESH_COOKIE_SECURE?: boolean;
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
