import { readFile } from 'node:fs/promises';
import { path, json, verifyHash } from './common.mjs';
import { parseJSONL } from './corpus.mjs';

export async function loadFixtures() {
  const manifest = await json(path('tests/fixtures/manifest.json'));
  for (const [file, hash] of Object.entries(manifest.files)) verifyHash(await readFile(path(file)), hash, file);
  const manual = await json(path('tests/fixtures/cases.json'));
  const generated = parseJSONL(await readFile(path('tests/fixtures/generated.jsonl'), 'utf8'));
  const cases = [...manual, ...generated];
  if (generated.length !== 10_000 || !manual.length) throw new Error('missing required cases');
  if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error('duplicate case IDs');
  return { manifest, manual, generated, cases,
    documents: await json(path('tests/fixtures/documents.json')),
    golden: await json(path('tests/fixtures/cmigemo-golden.json')),
    sequences: await json(path('tests/fixtures/sequences.json')),
  };
}
