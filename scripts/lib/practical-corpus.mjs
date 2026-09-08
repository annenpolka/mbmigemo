import { readFile } from 'node:fs/promises';
import { path, atomicWrite, sha256 } from './common.mjs';
import { parseTSV } from './dictionary.mjs';
import { encodeJSONL } from './corpus.mjs';

export async function practicalCases(fixtures, metadata, suite) {
  const entries = [...parseTSV(await readFile(path(metadata.source), 'utf8'))];
  let state = fixtures.manifest.seed >>> 0;
  const next = (limit) => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % limit;
  };
  const selected = new Set();
  const generated = [];
  const count = Math.min(1000, entries.length);
  while (selected.size < count) {
    const index = next(entries.length);
    if (selected.has(index)) continue;
    selected.add(index);
    const [reading, values] = entries[index];
    generated.push({ id: `practical-reading-${index}`, class: 'dictionary-reading', input: reading, needles: values });
    generated.push({ id: `practical-prefix-${index}`, class: 'dictionary-prefix', input: reading.slice(0, 1 + next(reading.length)), needles: values });
  }
  // Preserve reproducible inputs locally; receipt binds them to the source SHA.
  const file = '.cache/dictionaries/practical/compat-cases.jsonl';
  const content = encodeJSONL(generated);
  await atomicWrite(path(file), content);
  return {
    cases: suite === 'manual' ? fixtures.manual : [...fixtures.cases, ...generated],
    corpus: { seed: fixtures.manifest.seed, file, sha256: sha256(Buffer.from(content)), sourceSha256: metadata.sourceSha256,
      generatedCases: generated.length, generatedUniqueInputs: new Set(generated.map(({ input }) => input)).size },
  };
}
