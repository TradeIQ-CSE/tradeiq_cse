import { EntityManager } from 'typeorm';
import { resolveSettlementDate } from './settlement-date';

// Only the closed-day lookup touches the database, so a single query stub is
// enough to drive every case.
function managerReturning(closedDays: string[]): EntityManager {
  return {
    query: jest
      .fn()
      .mockResolvedValue(closedDays.map((d) => ({ trade_date: d }))),
  } as unknown as EntityManager;
}

describe('resolveSettlementDate', () => {
  it('settles two market days after a mid-week fill', async () => {
    // Mon 2025-01-06 -> Tue, Wed
    await expect(
      resolveSettlementDate(managerReturning([]), '2025-01-06'),
    ).resolves.toBe('2025-01-08');
  });

  it('skips the weekend for a Thursday fill', async () => {
    // Thu 2025-01-09 -> Fri, then Sat/Sun are skipped, so Mon
    await expect(
      resolveSettlementDate(managerReturning([]), '2025-01-09'),
    ).resolves.toBe('2025-01-13');
  });

  it('skips the weekend for a Friday fill', async () => {
    // Fri 2025-01-10 -> Mon, Tue
    await expect(
      resolveSettlementDate(managerReturning([]), '2025-01-10'),
    ).resolves.toBe('2025-01-14');
  });

  it('skips a day the calendar flags as closed', async () => {
    // Mon 2025-01-06 -> Tue is a holiday, so Wed, Thu
    await expect(
      resolveSettlementDate(managerReturning(['2025-01-07']), '2025-01-06'),
    ).resolves.toBe('2025-01-09');
  });

  // node-postgres hands back `date` columns as Date objects at LOCAL midnight,
  // while the cursor is stepped in UTC. Both sides must still render the same
  // calendar day or a closed day would silently fail to match. The string
  // fixtures above never exercise that, so pass the shape pg actually returns.
  it('matches a closed day delivered as a pg Date object', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValue([{ trade_date: new Date(2025, 0, 7) }]),
    } as unknown as EntityManager;

    await expect(resolveSettlementDate(manager, '2025-01-06')).resolves.toBe(
      '2025-01-09',
    );
  });

  it('skips a holiday run that spans a weekend', async () => {
    // Thu 2025-01-09 -> Fri closed, Sat/Sun skipped, Mon closed, so Tue, Wed
    await expect(
      resolveSettlementDate(
        managerReturning(['2025-01-10', '2025-01-13']),
        '2025-01-09',
      ),
    ).resolves.toBe('2025-01-15');
  });

  it('crosses a month boundary', async () => {
    // Thu 2025-01-30 -> Fri, then Sat/Sun skipped, so Mon 2025-02-03
    await expect(
      resolveSettlementDate(managerReturning([]), '2025-01-30'),
    ).resolves.toBe('2025-02-03');
  });

  it('crosses a year boundary', async () => {
    // Tue 2025-12-30 -> Wed, Thu. 2026-01-01 is not flagged closed by the
    // seeded calendar, so no holiday is assumed here.
    await expect(
      resolveSettlementDate(managerReturning([]), '2025-12-30'),
    ).resolves.toBe('2026-01-01');
  });

  // The walk is done in UTC precisely so the answer cannot depend on the
  // machine's zone. This asserts the property directly rather than relying on
  // a fixture that only diverges in zones we never run in: the dev machine is
  // UTC+5:30 and CI is UTC, and a local-time walk gives identical results in
  // both, so a plain date fixture would pass either way and guard nothing.
  it('gives the same answer regardless of the machine timezone', async () => {
    const original = process.env.TZ;
    const results: string[] = [];

    for (const zone of ['UTC', 'Asia/Colombo', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      results.push(
        await resolveSettlementDate(managerReturning([]), '2025-01-10'),
      );
    }

    process.env.TZ = original;
    expect(results).toEqual(['2025-01-14', '2025-01-14', '2025-01-14']);
  });
});
