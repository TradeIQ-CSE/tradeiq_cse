import { createHash } from 'crypto';
import {
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
  keyPrefix,
} from './api-key';

const WELL_FORMED = /^tiq_[A-Za-z0-9]{40}$/;
const BASE62 = /^[A-Za-z0-9]+$/;

describe('generateApiKey', () => {
  it('matches the documented shape', () => {
    expect(generateApiKey()).toMatch(WELL_FORMED);
  });

  // 1,000 samples: enough to make a modulo-bias or a rejection-sampling bug
  // show up as a shape or uniqueness failure, without the suite depending on
  // the exact character distribution.
  it('produces 1,000 samples that are all well formed, unique, and base62 only', () => {
    const samples = Array.from({ length: 1000 }, () => generateApiKey());

    for (const key of samples) {
      expect(key).toMatch(WELL_FORMED);
      expect(key.slice(4)).toMatch(BASE62);
    }
    expect(new Set(samples).size).toBe(samples.length);
  });
});

describe('hashApiKey', () => {
  it('matches a known SHA-256 vector', () => {
    // sha256("abc") — a standard test vector, independent of this codebase.
    expect(hashApiKey('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with a fresh SHA-256 digest for a generated key', () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(
      createHash('sha256').update(key, 'utf8').digest('hex'),
    );
  });

  it('produces a lowercase 64-character hex digest', () => {
    expect(hashApiKey(generateApiKey())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('keyPrefix', () => {
  it('takes the first 8 characters', () => {
    const key = generateApiKey();
    expect(keyPrefix(key)).toBe(key.slice(0, 8));
    expect(keyPrefix(key)).toHaveLength(8);
    expect(keyPrefix(key).startsWith('tiq_')).toBe(true);
  });
});

describe('isWellFormedApiKey', () => {
  it('accepts a generated key', () => {
    expect(isWellFormedApiKey(generateApiKey())).toBe(true);
  });

  it.each([
    ['missing the prefix', 'oHBvRPOIvGrv5iFlbCBFNOgmBjMtpsiaOclRz3Aw12'],
    ['too short', `tiq_${'a'.repeat(39)}`],
    ['too long', `tiq_${'a'.repeat(41)}`],
    ['containing an underscore in the secret', `tiq_${'a'.repeat(39)}_`],
    ['empty', ''],
    ['wrong prefix case', `TIQ_${'a'.repeat(40)}`],
  ])('rejects a value that is %s', (_label, value) => {
    expect(isWellFormedApiKey(value)).toBe(false);
  });
});
