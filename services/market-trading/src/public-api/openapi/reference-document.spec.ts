import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateReferenceDocument } from './reference-document';

describe('Generated public API reference contract', () => {
  it('matches the bundled artifact deterministically', async () => {
    const artifact = readFileSync(
      resolve(
        __dirname,
        '../../../../../frontend/src/features/developer-api/generated/public-api.json',
      ),
      'utf8',
    );
    expect(await generateReferenceDocument()).toBe(artifact);
  });
  it.each([
    ['development', '/'],
    ['production', '/api'],
  ])(
    'uses same-origin %s server %s for interactive requests',
    async (environment, prefix) => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = environment;
      try {
        const doc = JSON.parse(await generateReferenceDocument(false));
        expect(doc.servers[0].url).toBe(prefix);
      } finally {
        process.env.NODE_ENV = previous;
      }
    },
  );
  it('documents parameter validation, authenticated error headers, and correct nullable primitive types', async () => {
    const doc = JSON.parse(await generateReferenceDocument());
    for (const entry of Object.values(doc.paths) as {
      get: {
        parameters?: { in: string; schema: object }[];
        responses: Record<string, { headers: object }>;
      };
    }[]) {
      const operation = entry.get;
      for (const parameter of operation.parameters ?? []) {
        if (parameter.in === 'path')
          expect(parameter.schema).toMatchObject({
            type: 'string',
            minLength: 1,
            maxLength: 20,
          });
      }
      for (const status of ['400', '404'])
        if (operation.responses[status])
          expect(operation.responses[status].headers).toHaveProperty(
            'X-RateLimit-Remaining',
          );
    }
    expect(
      doc.paths['/public/v1/securities/{symbol}'].get.responses['400'],
    ).toBeDefined();
    expect(
      doc.components.schemas.PublicSecuritySchema.properties.shares_outstanding,
    ).toMatchObject({ type: 'integer', nullable: true });
    expect(
      doc.components.schemas.PublicDailyBarSchema.properties.open,
    ).toMatchObject({ type: 'number', nullable: true });
    const date = doc.paths['/public/v1/eod'].get.parameters.find(
      (p: { name: string }) => p.name === 'date',
    );
    expect(date.schema).toMatchObject({ type: 'string', format: 'date' });
  });
});
