import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CompactDictionary, CompactDictionaryBuilder } from 'jsmigemo';
import { path, verifyHash } from '../../scripts/lib/common.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { loadDictionary, compileDictionary, readCompactDictionary } from '../../scripts/lib/dictionary.mjs';
import { generateCorpus, encodeJSONL, classes } from '../../scripts/lib/corpus.mjs';

test('fixture checksums, case IDs, and seed corpus are reproducible', async () => {
  const f = await loadFixtures();
  const regenerated = generateCorpus();
  assert.equal(encodeJSONL(regenerated), await readFile(path('tests/fixtures/generated.jsonl'), 'utf8'));
  assert.equal(new Set(regenerated.map((c) => c.input)).size, 10_000);
  for (const category of classes) assert.equal(regenerated.filter((c) => c.class === category).length, 1250);
  assert.equal(f.golden.length, f.manual.length);
});

test('both compact dictionaries reproduce exactly and retain all TSV mappings', async () => {
  for (const name of ['tiny', 'alternate']) {
    const bytes = await loadDictionary(name);
    const source = await readFile(path(`tests/fixtures/${name}-dict.tsv`), 'utf8');
    assert.deepEqual(compileDictionary(source), Buffer.from(bytes));
  }
  const dict = new CompactDictionary((await loadDictionary()).buffer);
  assert.deepEqual([...dict.search('けんさく')].sort(), ['検索', '研削']);
  assert.deepEqual([...dict.predictiveSearch('けんさ')].sort(), ['検索', '検索機', '検査', '研削'].sort());
  assert.deepEqual([...dict.search('よし')], ['𠮷']);
  assert.deepEqual([...dict.search('えもじ')], ['😀']);
});

test('preparation rejects silent reading loss, duplicate readings, and malformed TSV', () => {
  for (const source of ['😀\t顔\n', 'か\t蚊\nか\t科\n', 'か\n', 'か\t\n', 'か\t蚊', 'か\t蚊\r\n', 'か\t\0\n']) {
    assert.throws(() => compileDictionary(source));
  }
});

test('checksum gate catches a one-byte corruption independently of format parsing', async () => {
  const bytes = await loadDictionary();
  const { manifest } = await loadFixtures();
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => verifyHash(bytes, manifest.dictionaries.tiny.sha256, 'tiny'), /SHA-256 mismatch/);
});

test('compact reader retains the final mapping group at 64-bit boundaries', async () => {
  const regression = JSON.parse(await readFile(path('tests/fixtures/regressions/compact-mapping-boundary.json'), 'utf8'));
  const entriesToTSV = (entries) => entries.map(([key, values]) => [key, ...values].join('\t') + '\n').join('');
  const shrunk = readCompactDictionary(compileDictionary(entriesToTSV(regression.entries)));
  for (const [key, values] of regression.entries) assert.deepEqual([...shrunk.search(key)].sort(), [...values].sort());
  for (const count of [61, 62, 63, 126, 190]) {
    const values = Array.from({ length: count }, (_, i) => `word${i}`);
    const entries = [['a', values]];
    const upstreamBytes = new Uint8Array(CompactDictionaryBuilder.build(new Map(entries)));
    const bytes = compileDictionary(entriesToTSV(entries));
    assert.deepEqual(new Uint8Array(bytes), upstreamBytes, 'reader fix must not alter the format');
    const dictionary = readCompactDictionary(bytes);
    assert.deepEqual([...dictionary.search('a')].sort(), [...values].sort());
    assert.deepEqual([...dictionary.predictiveSearch('a')].sort(), [...values].sort());
  }
});
