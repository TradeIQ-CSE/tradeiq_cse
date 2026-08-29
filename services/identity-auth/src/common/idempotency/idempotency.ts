import { randomUUID, createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import {
  IdempotencyKeyReusedException,
  ValidationFailedException,
} from '../errors/api-exception';

// docs/api/paper-trading-v1.md §4 — Idempotency-Key is scoped to
// user + HTTP method + route template + key. Shared so TIQ-59 (order
// submission) can reuse the same reserve-then-fill mechanic without
// duplicating the SQL.

export interface IdempotencyScope {
  userId: string;
  method: string;
  route: string;
  idempotencyKey: string;
}

export type IdempotencyReservation =
  { replayed: false; recordId: string } | { replayed: true; body: unknown };

export function hashCanonicalRequest(
  canonical: Record<string, unknown>,
): string {
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// docs/api/paper-trading-v1.md §4 — an opaque 8–128 character printable ASCII
// value. auth.idempotency_records enforces the same length as a CHECK
// constraint, so validating here is what turns a bad key into
// 400 VALIDATION_FAILED (§9.1) instead of a constraint violation surfacing as
// a 500.
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function assertValidIdempotencyKey(
  key: string | undefined,
): asserts key is string {
  if (!key) {
    throw new ValidationFailedException([
      { field: 'Idempotency-Key', reason: 'header is required' },
    ]);
  }
  if (key.length < 8 || key.length > 128 || !PRINTABLE_ASCII.test(key)) {
    throw new ValidationFailedException([
      {
        field: 'Idempotency-Key',
        reason: 'must be 8 to 128 printable ASCII characters',
      },
    ]);
  }
}

// Must run inside the same transaction as the side effect it guards: the
// reservation row and the resource it protects commit or roll back together.
export async function reserveIdempotencyKey(
  manager: EntityManager,
  scope: IdempotencyScope,
  requestHash: string,
): Promise<IdempotencyReservation> {
  const reserved: { idempotency_record_id: string }[] = await manager.query(
    `INSERT INTO auth.idempotency_records
       (idempotency_record_id, user_id, method, route, idempotency_key, request_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id, method, route, idempotency_key) DO NOTHING
     RETURNING idempotency_record_id`,
    [
      randomUUID(),
      scope.userId,
      scope.method,
      scope.route,
      scope.idempotencyKey,
      requestHash,
    ],
  );

  if (reserved.length > 0) {
    return { replayed: false, recordId: reserved[0].idempotency_record_id };
  }

  const existing: { request_hash: string; response_body: unknown }[] =
    await manager.query(
      `SELECT request_hash, response_body FROM auth.idempotency_records
       WHERE user_id = $1 AND method = $2 AND route = $3 AND idempotency_key = $4`,
      [scope.userId, scope.method, scope.route, scope.idempotencyKey],
    );

  const record = existing[0];
  // A missing row here would mean the conflicting insert vanished between the
  // two queries, which can't happen for an append-only table with no delete
  // path; the null-body branch below covers a reservation that never
  // completed (e.g. a crash mid-transaction).
  if (
    !record ||
    record.request_hash !== requestHash ||
    record.response_body === null
  ) {
    throw new IdempotencyKeyReusedException();
  }

  return { replayed: true, body: record.response_body };
}

export async function completeIdempotencyKey(
  manager: EntityManager,
  recordId: string,
  responseStatus: number,
  responseBody: unknown,
  createdResourceId?: string,
): Promise<void> {
  await manager.query(
    `UPDATE auth.idempotency_records
     SET response_status = $1, response_body = $2, created_resource_id = $3
     WHERE idempotency_record_id = $4`,
    [
      responseStatus,
      JSON.stringify(responseBody),
      createdResourceId ?? null,
      recordId,
    ],
  );
}
