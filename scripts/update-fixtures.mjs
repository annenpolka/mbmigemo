import { readFile } from 'node:fs/promises';
import { path, json, sha256, atomicWrite, encodeJSON } from './lib/common.mjs';
import { compileDictionary, dictionaryMetadata } from './lib/dictionary.mjs';
import { generateCorpus, encodeJSONL, seed, generatedCount, documentsFor } from './lib/corpus.mjs';
import { referencePatterns } from './lib/reference.mjs';

if (process.argv.slice(2).join(' ') !== '--write') throw new Error('Explicit baseline update: npm run fixtures:update -- --write. Review the resulting diff.');
const dictionaries = {};
for (const name of ['tiny', 'alternate']) {
  const bytes = compileDictionary(await readFile(path(`tests/fixtures/${name}-dict.tsv`), 'utf8'));
  dictionaries[name] = await dictionaryMetadata(name, bytes);
  await atomicWrite(path(dictionaries[name].file), bytes);
}
await atomicWrite(path('tests/fixtures/generated.jsonl'), encodeJSONL(generateCorpus()));
const cases = await json(path('tests/fixtures/cases.json'));
const documents = await json(path('tests/fixtures/documents.json'));
const patterns = await referencePatterns(cases.map((c) => c.input));
const golden = cases.map((c, i) => ({
  id: c.id, ...patterns[i],
  matched: documentsFor(c, documents).flatMap((doc, index) => new RegExp(patterns[i].pattern, 'u').test(doc) ? [index] : []),
}));
await atomicWrite(path('tests/fixtures/cmigemo-golden.json'), encodeJSON(golden));
const files = {};
for (const file of ['cases.json', 'documents.json', 'sequences.json', 'generated.jsonl', 'cmigemo-golden.json']) {
  files[`tests/fixtures/${file}`] = sha256(await readFile(path(`tests/fixtures/${file}`)));
}
files['tests/reference/lock.json'] = sha256(await readFile(path('tests/reference/lock.json')));
files['tests/reference/cmigemo-driver.c'] = sha256(await readFile(path('tests/reference/cmigemo-driver.c')));
await atomicWrite(path('tests/fixtures/manifest.json'), encodeJSON({
  schemaVersion: 1, reference: await json(path('tests/reference/lock.json')),
  converter: { name: 'jsmigemo', version: '0.5.2' }, seed, generatedCount,
  generatedDistinctInputs: new Set(generateCorpus().map((c) => c.input)).size,
  dictionaries, files,
}));
console.log(`Updated ${cases.length} golden cases and ${generatedCount} generated cases. Review fixtures and manifest together.`);
