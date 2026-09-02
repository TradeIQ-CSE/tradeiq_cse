import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  const PASSWORD = 'correct horse battery staple';

  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(hash, PASSWORD)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(hash, `${PASSWORD}!`)).resolves.toBe(false);
  });

  it('produces a different hash each time for the same password', async () => {
    // Salted per call, so two users sharing a password are not visibly
    // identical in the table.
    const [a, b] = await Promise.all([
      hashPassword(PASSWORD),
      hashPassword(PASSWORD),
    ]);
    expect(a).not.toBe(b);
    await expect(verifyPassword(b, PASSWORD)).resolves.toBe(true);
  });

  it('stores argon2id, not a weaker variant', async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$/);
  });

  it('never leaks the plaintext into the hash', async () => {
    expect(await hashPassword(PASSWORD)).not.toContain(PASSWORD);
  });

  it.each([
    ['empty', ''],
    ['not a hash', 'plainly-not-a-hash'],
    ['truncated', '$argon2id$v=19$m=19456,t=2,p=1$truncated'],
  ])(
    'returns false rather than throwing on a %s stored hash',
    async (_l, h) => {
      await expect(verifyPassword(h, PASSWORD)).resolves.toBe(false);
    },
  );
});
