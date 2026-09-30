import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateReferenceDocument } from '../src/public-api/openapi/reference-document';

async function main() {
  const destination = resolve(
    __dirname,
    '../../../frontend/src/features/developer-api/generated/public-api.json',
  );
  const document = await generateReferenceDocument();
  if (process.argv.includes('--check')) {
    if ((await readFile(destination, 'utf8')) !== document) {
      throw new Error(
        'Bundled API reference is stale. Run pnpm api:reference:generate.',
      );
    }
    console.log('Bundled API reference matches the public controllers.');
  } else {
    await writeFile(destination, document);
    console.log('Generated frontend public API reference.');
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
