import { durationToSeconds } from './auth.service';

// Unit coverage for durationToSeconds only. AuthService itself needs a
// database and a JwtService to exercise meaningfully, so mocking it here
// would just restate the e2e suite with fakes; that is deliberately out of
// scope for this file.
describe('durationToSeconds', () => {
  it.each([
    ['1s', 1],
    ['5m', 300],
    ['1h', 3600],
    ['15d', 1296000],
    ['2w', 1209600],
    ['1y', 31557600],
    // The five-digit ceiling from env.validation.ts's DURATION regex: the
    // largest value that still fits.
    ['99999m', 5999940],
  ])('reads %s as %d seconds', (value, seconds) => {
    expect(durationToSeconds(value)).toBe(seconds);
  });

  it.each([
    // A bare number: jsonwebtoken's `ms()` would read this as milliseconds
    // while durationToSeconds would read it as seconds, so expires_in would
    // disagree with the token's real lifetime (see the comment above
    // durationToSeconds). Refusing it is the point of the function, not an
    // edge case of it.
    '300',
    // Zero is refused everywhere, not just here: a zero-second lifetime
    // would make expires_at equal issued_at and trip
    // refresh_tokens_expiry_chk on the refresh token.
    '0m',
    // One digit past the five-digit ceiling documented on durationToSeconds
    // and on DURATION in env.validation.ts.
    '100000m',
    // Wrong case: only the lowercase units below are recognised.
    '5M',
    // Whitespace is not part of the grammar.
    '5 m',
    // Not a unit the regex knows.
    '5min',
    // Sign is not part of the grammar; nothing legitimate is negative.
    '-5m',
    '',
  ])('rejects %s', (value) => {
    expect(() => durationToSeconds(value)).toThrow();
  });
});
