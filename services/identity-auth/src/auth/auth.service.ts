import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  Repository,
  UpdateResult,
} from 'typeorm';
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
  { kind: 'reuse' } | { kind: 'rotate'; session: IssuedSession };

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

  // docs/api/auth-v1.md §3. Everything that touches a family — checking a
  // token, spending it, and inserting its successor — happens inside one
  // transaction holding a lock on the whole family, so a rotation and a
  // revocation can never interleave.
  async refresh(presented: string | undefined): Promise<IssuedSession> {
    if (!presented) {
      throw new RefreshTokenInvalidException();
    }

    const tokenHash = hashToken(presented);

    // The reuse case revokes inside the transaction and reports that it did,
    // instead of throwing from within it. Throwing there would roll the
    // revocation back, leaving the stolen session alive — the exact opposite
    // of the intent.
    const outcome = await this.dataSource.transaction<RefreshOutcome>(
      async (manager) => {
        const tokens = manager.getRepository(RefreshToken);

        const found = await tokens.findOne({ where: { tokenHash } });
        if (!found) {
          throw new RefreshTokenInvalidException();
        }

        await lockFamily(tokens, found.familyId);

        // Re-read under the lock. Whatever we waited behind may have spent this
        // token or revoked the family, and the copy read above predates that.
        const row = await tokens.findOne({ where: { tokenHash } });
        if (!row) {
          throw new RefreshTokenInvalidException();
        }

        // The credential was presented twice, so two parties hold it. There is
        // no way to tell the thief from the real client, so end the session for
        // both rather than hand either one a fresh token.
        //
        // Revoked here, under the lock this transaction already holds, rather
        // than after it commits. The live successor is still usable until the
        // revocation lands, so revoking afterwards leaves a gap in which a
        // concurrent refresh of that successor takes the lock first and leaves
        // with a fresh access token — valid for its full lifetime, and by then
        // unrevokable.
        if (row.usedAt) {
          await revokeFamilyRows(tokens, row.familyId);
          return { kind: 'reuse' };
        }

        if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
          throw new RefreshTokenInvalidException();
        }

        await tokens.update({ tokenId: row.tokenId }, { usedAt: new Date() });

        const user = await manager.getRepository(User).findOne({
          where: { userId: row.userId, deletedAt: IsNull() },
        });
        if (!user) {
          throw new RefreshTokenInvalidException();
        }

        // Inserted while the family lock is still held, so a revocation
        // running concurrently either waits and then covers this row, or has
        // already committed and made the re-read above reject the request.
        const session = await this.issueSession(user, row.familyId, manager);
        return { kind: 'rotate', session };
      },
    );

    if (outcome.kind === 'reuse') {
      throw new RefreshTokenInvalidException();
    }

    return outcome.session;
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
      await this.revokeFamily(row.familyId);
    }
  }

  // Takes the same family lock rotation does, so a successor cannot be
  // inserted between this reading the family and updating it.
  private async revokeFamily(familyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tokens = manager.getRepository(RefreshToken);
      await lockFamily(tokens, familyId);
      await revokeFamilyRows(tokens, familyId);
    });
  }

  async findActiveUser(userId: string): Promise<User | null> {
    return this.users.findOne({ where: { userId, deletedAt: IsNull() } });
  }

  decryptEmail(user: User): string {
    return this.email.decrypt(user.emailEncrypted);
  }

  // `manager` lets a caller enrol the insert in its own transaction; refresh
  // relies on that to keep the successor under the family lock.
  private async issueSession(
    user: User,
    familyId: string,
    manager?: EntityManager,
  ): Promise<IssuedSession> {
    const tokens = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokens;
    const accessTtl = this.config.getOrThrow<string>('auth.accessTokenTtl');

    const accessToken = await this.jwt.signAsync(
      { sub: user.userId, role: user.role },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const issuedAt = new Date();

    await tokens.insert({
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

// SELECT ... FOR UPDATE over every row of one family. Rotation and revocation
// both take it before touching the family, so they serialise instead of one
// slipping a fresh token past the other.
function lockFamily(
  tokens: Repository<RefreshToken>,
  familyId: string,
): Promise<RefreshToken[]> {
  return tokens
    .createQueryBuilder('t')
    .setLock('pessimistic_write')
    .where('t.family_id = :familyId', { familyId })
    .getMany();
}

// Revokes every live row of one family through whatever transaction `tokens`
// belongs to, so the caller chooses the atomicity. Both callers hold the family
// lock first; without it a rotation could insert a successor between the read
// and the update and survive the revocation.
function revokeFamilyRows(
  tokens: Repository<RefreshToken>,
  familyId: string,
): Promise<UpdateResult> {
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
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600,
};

// Must agree exactly with DURATION in env.validation.ts, digit ceiling
// included. Reading a bare "300" as seconds here while jsonwebtoken reads it as
// milliseconds is what makes expires_in disagree with the token's real
// lifetime, so this refuses the ambiguous form rather than guessing, and every
// accepted value is a whole number of seconds or more and small enough to stay
// a safe integer.
export function durationToSeconds(value: string): number {
  const match = /^([1-9]\d{0,4})(s|m|h|d|w|y)$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]];
}
