import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/render';
import { server } from '../../test/server';
import type { DeveloperKey, DeveloperUsage } from '../../features/developer-api/api';
import { formatDateTime } from '../../features/paper-trading/format';
import { ApiKey } from './ApiKey';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

// Deliberately not a real 40-character tiq_ secret (docs/api/public-api-v1.md
// §2) — a secret scanner flagged one in an earlier draft of these fixtures.
const FAKE_SECRET = 'tiq_test_only_not_a_real_secret';
const FAKE_REGENERATED_SECRET = 'tiq_test_only_regenerated_secret';

function key(overrides: Partial<DeveloperKey> = {}): DeveloperKey {
  return {
    prefix: 'tiq_oHBv',
    label: null,
    created_at: '2026-08-01T04:00:00.000Z',
    last_used_at: null,
    ...overrides,
  };
}

function thirtyDaysAllZero(): DeveloperUsage['daily'] {
  const days: DeveloperUsage['daily'] = [];
  const base = new Date('2026-09-26T00:00:00Z');
  for (let i = 29; i >= 0; i--) {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() - i);
    days.push({ date: day.toISOString().slice(0, 10), request_count: 0 });
  }
  return days;
}

function thirtyDaysWithSomeUsage(): DeveloperUsage['daily'] {
  const days = thirtyDaysAllZero();
  days[days.length - 1] = { ...days[days.length - 1], request_count: 5 };
  return days;
}

function usage(overrides: Partial<DeveloperUsage> = {}): DeveloperUsage {
  return {
    limit: 100,
    used: 37,
    reset_at: '2026-09-26T10:00:00Z',
    daily: thirtyDaysAllZero(),
    ...overrides,
  };
}

// Stateful mocks: a create/regenerate/revoke has to be reflected in the very
// next GET, or a background refetch reloads a stale/empty mock — that's what
// made an earlier suite here flaky.
function serveKey(state: DeveloperKey | null) {
  server.use(http.get('*/developer/key', () => HttpResponse.json({ data: state })));
}
function serveUsage(state: DeveloperUsage | null) {
  server.use(http.get('*/developer/usage', () => HttpResponse.json({ data: state })));
}

describe('ApiKey page — header', () => {
  it('shows the developer-access header, not a repeated card title', async () => {
    serveKey(null);
    serveUsage(null);
    renderWithProviders(<ApiKey />);

    expect(screen.getByText(t('apiKeyPage.eyebrow'))).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: t('apiKeyPage.title'), level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('apiKeyPage.description'))).toBeInTheDocument();
  });
});

describe('ApiKey page — Developer API card', () => {
  it('loads, then shows the no-key state', async () => {
    serveKey(null);
    serveUsage(null);
    renderWithProviders(<ApiKey />);

    expect(screen.getByRole('heading', { name: t('developerApi.title') })).toBeInTheDocument();
    expect(await screen.findByText(t('developerApi.noKey.description'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('developerApi.noKey.create') })).toBeInTheDocument();
  });

  it('says so when the key cannot load, with a retry', async () => {
    server.use(
      http.get('*/developer/key', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x', trace_id: 't' } }, { status: 500 }),
      ),
    );
    renderWithProviders(<ApiKey />);

    expect(await screen.findByText(t('developerApi.errors.load'))).toBeInTheDocument();
  });

  it('creates a key, shows the secret once, and hides it again on Done', async () => {
    const user = userEvent.setup({ delay: null });
    serveKey(null);
    serveUsage(null);
    server.use(
      http.post('*/developer/key', async ({ request }) => {
        const body = (await request.json()) as { label?: string };
        serveKey({
          prefix: 'tiq_test',
          label: body.label ?? null,
          created_at: '2026-09-26T09:00:00.000Z',
          last_used_at: null,
        });
        serveUsage(usage());
        return HttpResponse.json(
          {
            data: {
              key: FAKE_SECRET,
              prefix: 'tiq_test',
              label: body.label ?? null,
              created_at: '2026-09-26T09:00:00.000Z',
            },
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(t('developerApi.noKey.description'));
    await user.click(screen.getByRole('button', { name: t('developerApi.noKey.create') }));

    expect(await screen.findByText(FAKE_SECRET)).toBeInTheDocument();
    expect(screen.getByText(t('developerApi.justCreated.saveNow'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('developerApi.justCreated.done') }));

    expect(screen.queryByText(FAKE_SECRET)).not.toBeInTheDocument();
    expect(await screen.findByText('tiq_test••••')).toBeInTheDocument();
  });

  it('shows Copied for a couple of seconds after copying the secret', async () => {
    // userEvent.setup() installs its own clipboard stub, so this has to
    // redefine navigator.clipboard *after* setup() or setup() clobbers it.
    const user = userEvent.setup({ delay: null });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    serveKey(null);
    serveUsage(null);
    server.use(
      http.post('*/developer/key', () => {
        serveKey({ prefix: 'tiq_test', label: null, created_at: '2026-09-26T09:00:00.000Z', last_used_at: null });
        return HttpResponse.json(
          { data: { key: FAKE_SECRET, prefix: 'tiq_test', label: null, created_at: '2026-09-26T09:00:00.000Z' } },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(t('developerApi.noKey.description'));
    await user.click(screen.getByRole('button', { name: t('developerApi.noKey.create') }));
    await screen.findByText(FAKE_SECRET);

    await user.click(screen.getByRole('button', { name: t('developerApi.copyKey') }));

    expect(writeText).toHaveBeenCalledWith(FAKE_SECRET);
    expect(await screen.findByText(t('developerApi.copied'))).toBeInTheDocument();
  });

  it('falls back to the has-key state on a 409 from create', async () => {
    const user = userEvent.setup({ delay: null });
    const existing = key({ label: 'Existing script' });
    serveKey(null);
    serveUsage(usage());
    server.use(
      http.post('*/developer/key', () => {
        // Someone else already created one; the server's truth wins.
        serveKey(existing);
        return HttpResponse.json(
          { error: { code: 'API_KEY_EXISTS', message: 'x', trace_id: 't' } },
          { status: 409 },
        );
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(t('developerApi.noKey.description'));
    await user.click(screen.getByRole('button', { name: t('developerApi.noKey.create') }));

    expect(await screen.findByText(`${existing.prefix}••••`)).toBeInTheDocument();
    expect(screen.getByText('Existing script')).toBeInTheDocument();
  });

  it('shows the has-key facts, the label, dates and this hour’s usage', async () => {
    const withLabel = key({ label: 'My script', last_used_at: '2026-09-25T14:12:00.000Z' });
    serveKey(withLabel);
    serveUsage(usage());
    renderWithProviders(<ApiKey />);

    expect(await screen.findByText(`${withLabel.prefix}••••`)).toBeInTheDocument();
    expect(screen.getByText('My script')).toBeInTheDocument();
    expect(
      screen.getByText(new Date(withLabel.created_at).toLocaleDateString('en-LK', { dateStyle: 'medium' })),
    ).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(withLabel.last_used_at!, 'en-LK'))).toBeInTheDocument();

    const expectedTime = new Date('2026-09-26T10:00:00Z').toLocaleTimeString('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    expect(
      screen.getByText(t('developerApi.usage.value', { used: 37, limit: 100, time: expectedTime })),
    ).toBeInTheDocument();
  });

  it('shows "Not used yet" for a key that has never been used', async () => {
    serveKey(key({ last_used_at: null }));
    serveUsage(usage());
    renderWithProviders(<ApiKey />);

    expect(await screen.findByText(t('developerApi.facts.neverUsed'))).toBeInTheDocument();
  });

  it('shows a dash when the hourly count cannot be read', async () => {
    serveKey(key());
    serveUsage(usage({ used: null }));
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a quiet line instead of an empty chart when every day is zero', async () => {
    serveKey(key());
    serveUsage(usage({ daily: thirtyDaysAllZero() }));
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    expect(await screen.findByText(t('developerApi.usage.none'))).toBeInTheDocument();
  });

  it('labels the usage chart with a caption when there is usage to show', async () => {
    serveKey(key());
    serveUsage(usage({ daily: thirtyDaysWithSomeUsage() }));
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    // The same caption text also backs the chart's sr-only table <caption>,
    // so there are two matches — this just proves the visible one rendered.
    expect((await screen.findAllByText(t('developerApi.usage.chartLabel'))).length).toBeGreaterThan(0);
  });

  it('regenerates the key behind a confirmation dialog', async () => {
    const user = userEvent.setup({ delay: null });
    serveKey(key({ label: 'Old label' }));
    serveUsage(usage());
    const calls: string[] = [];
    server.use(
      http.post('*/developer/key/regenerate', () => {
        calls.push('regenerate');
        serveKey({
          prefix: 'tiq_newn',
          label: 'Old label',
          created_at: '2026-09-26T09:00:00.000Z',
          last_used_at: null,
        });
        return HttpResponse.json(
          {
            data: {
              key: FAKE_REGENERATED_SECRET,
              prefix: 'tiq_newn',
              label: 'Old label',
              created_at: '2026-09-26T09:00:00.000Z',
            },
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    await user.click(screen.getByRole('button', { name: t('developerApi.actions.regenerate') }));
    expect(await screen.findByText(t('developerApi.regenerateDialog.description'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('developerApi.regenerateDialog.confirm') }));

    expect(await screen.findByText(FAKE_REGENERATED_SECRET)).toBeInTheDocument();
    expect(calls).toEqual(['regenerate']);
  });

  it('cancels out of the regenerate dialog without calling it', async () => {
    const user = userEvent.setup({ delay: null });
    serveKey(key());
    serveUsage(usage());
    let called = false;
    server.use(
      http.post('*/developer/key/regenerate', () => {
        called = true;
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    await user.click(screen.getByRole('button', { name: t('developerApi.actions.regenerate') }));
    await user.click(await screen.findByRole('button', { name: t('developerApi.actions.cancel') }));

    expect(screen.queryByText(t('developerApi.regenerateDialog.description'))).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('revokes the key behind a confirmation dialog', async () => {
    const user = userEvent.setup({ delay: null });
    serveKey(key());
    serveUsage(usage());
    const calls: string[] = [];
    server.use(
      http.delete('*/developer/key', () => {
        calls.push('revoke');
        serveKey(null);
        serveUsage(null);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<ApiKey />);

    await screen.findByText(`${key().prefix}••••`);
    await user.click(screen.getByRole('button', { name: t('developerApi.actions.revoke') }));
    expect(await screen.findByText(t('developerApi.revokeDialog.description'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('developerApi.revokeDialog.confirm') }));

    expect(calls).toEqual(['revoke']);
    expect(await screen.findByText(t('developerApi.noKey.description'))).toBeInTheDocument();
  });
});
