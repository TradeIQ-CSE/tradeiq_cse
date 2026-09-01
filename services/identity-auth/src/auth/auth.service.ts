import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { EmailCipher } from '../common/crypto/email-cipher';
import { hashPassword, verifyPassword } from '../common/crypto/password';
import {
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
  RefreshTokenInvalidException,
} from '../common/errors/api-exception';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export interface SessionUser {
  user_id: string;
  display_name: string;
  role: 'investor' | 'admin';
}

// Discriminated so the reuse path cannot be mistaken for a successful rotation
// once it leaves the transaction.
type RefreshOutcome =
  | { kind: 'reuse'; familyId: string }
  | { kind: 'rotate'; user: User; familyId: string };

// What the controller needs to answer a request: the JSON body, plus the
// refresh token it must put in a cookie. The refresh token never enters the
// body (docs/api/auth-v1.md §4.6).
export interface IssuedSession {
  refreshToken: string;
  body: {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    user: SessionUser;
  };
}

// A verify() against a hash of nothing, used to spend the same work on an
// unknown address as on a real one (§4.2). Computed once at module load.
const DUMMY_HASH_PROMISE = hashPassword(randomBytes(32).toString('hex'));

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailCipher,
    private readonly dataSource: DataSource,
  ) {}

  async signup(dto: SignupDto): Promise<IssuedSession> {
    const emailHash = this.email.hash(dto.email);

    const user = this.users.create({
      userId: randomUUID(),
      emailEncrypted: this.email.encrypt(dto.email),
      emailHash,
      passwordHash: await hashPassword(dto.password),
      displayName: dto.display_name,
      role: 'investor',
      languagePref: dto.language_pref ?? 'en',
      emailVerified: false,
    });

    try {
      await this.users.insert(user);
    } catch (error) {
      // The UNIQUE index on email_hash is the authority, not a prior SELECT:
      // two concurrent signups for one address would both pass that check.
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    }

    return this.issueSession(user, randomUUID());
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.users.findOne({
      where: { emailHash: this.email.hash(dto.email), deletedAt: IsNull() },
    });

    // Verify against a dummy hash when there is no user, so an unknown address
    // costs the same time as a known one and cannot be identified by timing.
    const stored = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const correct = await verifyPassword(stored, dto.password);

    if (!user || !correct) {
      throw new InvalidCredentialsException();
    }

    return this.issueSession(user, randomUUID());
  }

  // docs/api/auth-v1.md §3. Rotation and reuse detection are one transaction:
  // between reading a token and marking it used, a second request holding the
  // same value must not also succeed.
  async refresh(presented: string | undefined): Promise<IssuedSession> {
    if (!presented) {
      throw new RefreshTokenInvalidException();
    }

    const tokenHash = hashToken(presented);

    // The reuse case reports its family instead of throwing from inside the
    // transaction. Throwing there would roll the revocation back with it,
    // leaving the stolen session alive — the exact opposite of the intent.
    const outcome = await this.dataSource.transaction<RefreshOutcome>(
      async (manager) => {
        const tokens = manager.getRepository(RefreshToken);

        // Locked for the duration: concurrent refreshes with the same token
        // serialise here, so the second one sees used_at already set and is
        // correctly treated as a replay rather than racing to a second session.
        const row = await tokens
          .createQueryBuilder('t')
          .setLock('pessimistic_write')
          .where('t.token_hash = :tokenHash', { tokenHash })
          .getOne();

        if (!row) {
          throw new RefreshTokenInvalidException();
        }

        // The credential was presented twice, so two parties hold it. There is
        // no way to tell the thief from the real client, so end the session for
        // both rather than hand either one a fresh token.
        if (row.usedAt) {
          return { kind: 'reuse', familyId: row.familyId };
        }

        if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
          throw new RefreshTokenInvalidException();
        }

        await tokens.update({ tokenId: row.tokenId }, { usedAt: new Date() });

        const found = await manager.getRepository(User).findOne({
          where: { userId: row.userId, deletedAt: IsNull() },
        });
        if (!found) {
          throw new RefreshTokenInvalidException();
        }

        return { kind: 'rotate', user: found, familyId: row.familyId };
      },
    );

    if (outcome.kind === 'reuse') {
      await revokeFamily(this.refreshTokens, outcome.familyId);
      throw new RefreshTokenInvalidException();
    }

    // Same family: the new token continues the session rather than starting one.
    return this.issueSession(outcome.user, outcome.familyId);
  }

  // Idempotent by design (§4.4): logging out with a token that is already gone
  // is a success, because the desired state already holds.
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) {
      return;
    }

    const row = await this.refreshTokens.findOne({
      where: { tokenHash: hashToken(presented) },
    });
    if (row) {
      await revokeFamily(this.refreshTokens, row.familyId);
    }
  }

  async findActiveUser(userId: string): Promise<User | null> {
    return this.users.findOne({ where: { userId, deletedAt: IsNull() } });
  }

  decryptEmail(user: User): string {
    return this.email.decrypt(user.emailEncrypted);
  }

  private async issueSession(
    user: User,
    familyId: string,
  ): Promise<IssuedSession> {
    const accessTtl = this.config.getOrThrow<string>('auth.accessTokenTtl');

    const accessToken = await this.jwt.signAsync(
      { sub: user.userId, role: user.role },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const issuedAt = new Date();

    await this.refreshTokens.insert({
      tokenId: randomUUID(),
      userId: user.userId,
      tokenHash: hashToken(refreshToken),
      familyId,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + this.refreshTtlMs()),
      usedAt: null,
      revokedAt: null,
    });

    return {
      refreshToken,
      body: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: durationToSeconds(accessTtl),
        user: {
          user_id: user.userId,
          display_name: user.displayName,
          role: user.role,
        },
      },
    };
  }

  refreshTtlMs(): number {
    return (
      durationToSeconds(
        this.config.getOrThrow<string>('auth.refreshTokenTtl'),
      ) * 1000
    );
  }
}

// Only the hash reaches the database, so a dump of refresh_tokens contains
// nothing presentable (docs/api/auth-v1.md §2.2).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function revokeFamily(
  tokens: Repository<RefreshToken>,
  familyId: string,
): Promise<unknown> {
  return tokens
    .createQueryBuilder()
    .update()
    .set({ revokedAt: new Date() })
    .where('family_id = :familyId AND revoked_at IS NULL', { familyId })
    .execute();
}

// Postgres unique_violation. Matched on the code rather than the message so it
// survives a locale or wording change in the server.
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

const UNIT_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600,
};

// The same "120", "5m", "15d" grammar jsonwebtoken accepts, so expires_in and
// the cookie Max-Age cannot drift from the token's real lifetime. Validated at
// boot by env.validation.ts, so a bad value never reaches here.
export function durationToSeconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)?$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }
  return Math.round(Number(match[1]) * UNIT_SECONDS[match[2] ?? 's']);
}
