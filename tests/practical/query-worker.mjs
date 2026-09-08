import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createMigemo } from '../../packages/mbmigemo/dist/index.js';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';

const { input, backend, expectedPattern, documents } = JSON.parse(readFileSync(0, 'utf8'));
const start = performance.now();
const migemo = await createMigemo({ dictionary: await loadDictionary('practical'), backend });
const ready = performance.now();
const actualPattern = migemo.query(input);
const queried = performance.now();
const actual = new RegExp(actualPattern, 'u');
const oracle = new RegExp(expectedPattern, 'u');
const compiled = performance.now();
const missing = [], extra = [];
// The engine may defer native compilation until .test(). Test all documents
// inside the timed worker; merely constructing RegExp misses the regression.
for (const document of documents) {
  const wanted = oracle.test(document);
  const got = actual.test(document);
  if (wanted && !got) missing.push(document);
  if (!wanted && got) extra.push(document);
}
process.stdout.write(JSON.stringify({
  backend: migemo.backend, input, missing, extra,
  actualLength: actualPattern.length, expectedLength: expectedPattern.length,
  initializationMs: ready - start, queryMs: queried - ready,
  constructorMs: compiled - queried, matchAndJitMs: performance.now() - compiled,
}));
