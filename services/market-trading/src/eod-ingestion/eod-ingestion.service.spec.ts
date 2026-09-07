import { DataSource } from 'typeorm';
import { EodIngestionService } from './eod-ingestion.service';
import {
  EodIngestionReceipt,
  EodIngestionRequest,
} from './eod-ingestion.types';

type ServiceWithAttempt = {
  ingestAttempt(input: EodIngestionRequest): Promise<EodIngestionReceipt>;
};

const input = {
  batch_id: 'a'.repeat(64),
} as EodIngestionRequest;

const receipt = {
  batch_id: input.batch_id,
  trade_date: '2026-09-04',
  status: 'succeeded',
  market_digest: 'b'.repeat(64),
  records_processed: 1,
  records_accepted: 1,
  records_quarantined: 0,
  started_at: '2026-09-04T09:18:00.000Z',
  completed_at: '2026-09-04T09:18:01.000Z',
  replayed: false,
};

describe('EodIngestionService serialization retries', () => {
  function serviceAndAttempt() {
    const service = new EodIngestionService({} as DataSource);
    const attempt = jest.spyOn(
      service as unknown as ServiceWithAttempt,
      'ingestAttempt',
    );
    return { service, attempt };
  }

  it('retries the complete ingestion after SQLSTATE 40001', async () => {
    const { service, attempt } = serviceAndAttempt();
    const failure = Object.assign(new Error('serialization failure'), {
      code: '40001',
    });
    attempt.mockRejectedValueOnce(failure).mockResolvedValueOnce(receipt);

    await expect(service.ingest(input)).resolves.toBe(receipt);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt).toHaveBeenNthCalledWith(1, input);
    expect(attempt).toHaveBeenNthCalledWith(2, input);
  });

  it('stops after three nested driver serialization failures', async () => {
    const { service, attempt } = serviceAndAttempt();
    const failure = Object.assign(new Error('serialization failure'), {
      driverError: { code: '40001' },
    });
    attempt.mockRejectedValue(failure);

    await expect(service.ingest(input)).rejects.toBe(failure);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('does not retry other database failures', async () => {
    const { service, attempt } = serviceAndAttempt();
    const failure = Object.assign(new Error('unique violation'), {
      code: '23505',
    });
    attempt.mockRejectedValue(failure);

    await expect(service.ingest(input)).rejects.toBe(failure);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
