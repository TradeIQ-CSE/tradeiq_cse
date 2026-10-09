import { afterEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { clearSession, getToken, setSession } from '../../lib/session';
import { getPrediction, ML_PREDICTION_API_URL } from './api';

afterEach(clearSession);

describe('ML API authentication', () => {
  it('attaches the bearer token and shares the existing refresh-on-401 flow', async () => {
    setSession({ access_token: 'expired', user: { user_id: 'u1', display_name: 'Ada', role: 'investor' } });
    const seen: string[] = [];
    server.use(
      http.get(`${ML_PREDICTION_API_URL}/predictions/COMB.N0000`, ({ request }) => {
        seen.push(request.headers.get('Authorization')!);
        expect(new URL(request.url).searchParams.get('config_key')).toBe('pt0.015_sl0.0075_H36_T30');
        if (seen.length === 1) return HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Expired', trace_id: 'test' } }, { status: 401 });
        return HttpResponse.json({ data: { symbol: 'COMB.N0000', config_key: 'pt0.015_sl0.0075_H36_T30', availability: 'no_prediction', prediction: null } });
      }),
      http.post('*/auth/refresh', () => HttpResponse.json({ data: { access_token: 'refreshed', user: { user_id: 'u1', display_name: 'Ada', role: 'investor' } } })),
    );
    const result = await getPrediction('COMB.N0000', 'pt0.015_sl0.0075_H36_T30');
    expect(result.availability).toBe('no_prediction');
    expect(seen).toEqual(['Bearer expired', 'Bearer refreshed']);
    expect(getToken()).toBe('refreshed');
  });
});
