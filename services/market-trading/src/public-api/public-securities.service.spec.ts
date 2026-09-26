import { escapeLikePattern } from './public-securities.service';

// docs/api/public-api-v1.md §6.1 — `search` is matched as literal text, so
// ILIKE's own special characters must be escaped before a search term is
// wrapped in `%...%` / `...%` wildcards, paired with `ESCAPE '\'` in the
// query itself (public-securities.service.ts's list()).
describe('escapeLikePattern', () => {
  it('leaves ordinary text unchanged', () => {
    expect(escapeLikePattern('JKH')).toBe('JKH');
    expect(escapeLikePattern('Hatton National Bank')).toBe(
      'Hatton National Bank',
    );
  });

  it('escapes a literal percent sign so it does not act as a wildcard', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapes a literal underscore so it does not match any single character', () => {
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('AB_C')).toBe('AB\\_C');
  });

  it('escapes a literal backslash first, so it is not re-interpreted', () => {
    expect(escapeLikePattern('\\')).toBe('\\\\');
    expect(escapeLikePattern('A\\%B')).toBe('A\\\\\\%B');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeLikePattern('%_%_')).toBe('\\%\\_\\%\\_');
  });
});
