import { buildCorsOptionsDelegate, CorsOptionsLike } from './cors';

describe('buildCorsOptionsDelegate', () => {
  const origins = ['https://app.example.com', 'http://localhost:5173'];
  const delegate = buildCorsOptionsDelegate(origins);

  function optionsFor(path: string): Promise<CorsOptionsLike> {
    return new Promise((resolve, reject) => {
      delegate({ path }, (err, options) => {
        if (err) reject(err);
        else resolve(options);
      });
    });
  }

  it('allows any origin, GET only, on a /public/ path', async () => {
    const options = await optionsFor('/public/v1/securities');
    expect(options).toEqual({
      origin: '*',
      methods: ['GET'],
      allowedHeaders: ['X-API-Key'],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ],
    });
  });

  it('matches a nested /public/ path too', async () => {
    const options = await optionsFor('/public/v1/indices/SL20/values');
    expect(options.origin).toBe('*');
  });

  it('keeps the configured origins and methods on every other path', async () => {
    const options = await optionsFor('/watchlist');
    expect(options).toEqual({
      origin: origins,
      methods: ['GET', 'POST', 'DELETE'],
    });
  });

  it('falls back to req.url when req.path is absent', async () => {
    const options = await new Promise<CorsOptionsLike>((resolve) => {
      delegate({ url: '/public/v1/eod?page=2' }, (_err, o) => resolve(o));
    });
    expect(options.origin).toBe('*');
  });

  it('does not treat a path that merely contains "public" as the public API', async () => {
    const options = await optionsFor('/developer/publicity');
    expect(options.origin).toBe(origins);
  });
});
