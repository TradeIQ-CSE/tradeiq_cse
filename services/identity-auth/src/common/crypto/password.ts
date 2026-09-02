import * as argon2 from 'argon2';

// docs/api/auth-v1.md §4.1. Argon2id is OWASP's first choice for password
// storage: memory-hard, so a GPU or ASIC buys an attacker far less than it
// would against bcrypt.
//
// Parameters follow OWASP's minimum for argon2id (19 MiB, 2 iterations,
// 1 degree of parallelism). The cost lives in the encoded hash, so raising it
// later does not invalidate existing rows — they keep verifying under the
// parameters they were written with.
const OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, OPTIONS);
}

// A malformed or truncated stored hash makes argon2 throw. That must read as
// "this password is wrong", never as a 500 that tells the caller the row is
// corrupt.
export async function verifyPassword(
  hash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
