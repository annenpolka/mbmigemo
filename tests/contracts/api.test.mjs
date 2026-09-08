// These tests load only the implementation. They intentionally fail to load
// before M2/M3; no reference implementation fallback and no skip/todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary, compileDictionary } from '../../scripts/lib/dictionary.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { referencePatterns } from '../../scripts/lib/reference.mjs';
import { compareCase } from '../../scripts/lib/compare.mjs';
import { malformedDictionaries } from '../support/malformed.mjs';

const modulePath = path(process.env.MBMIGEMO_MODULE ?? 'packages/mbmigemo/dist/index.js');
const { createMigemo } = await import(pathToFileURL(modulePath));
assert.equal(typeof createMigemo, 'function');
const backends = (process.env.MBMIGEMO_BACKENDS ?? 'js,wasm-gc').split(',');
assert.ok(backends.length > 0 && backends.every((b) => ['js', 'wasm-gc'].includes(b)));
assert.equal(new Set(backends).size, backends.length);

test('default backend is JS and initialization is asynchronous', async () => {
  const initialized = createMigemo({ dictionary: await loadDictionary() });
  assert.ok(initialized instanceof Promise);
  assert.equal((await initialized).backend, 'js');
});

for (const backend of backends) {
  const initialize = async (dictionary = undefined) => createMigemo({ dictionary: dictionary ?? await loadDictionary(), backend });

  test(`${backend}: public synchronous query and empty-input contract`, async () => {
    const instance = await initialize();
    assert.equal(instance.backend, backend);
    assert.equal(typeof instance.query('kensaku'), 'string');
    const re = new RegExp(instance.query('kensaku'), 'u');
    for (const doc of ['検索', 'けんさく', 'ケンサク', '前検索後']) assert.ok(re.test(doc), doc);
    assert.ok(!re.test('無関係'));
    assert.equal(instance.query(''), '(?!)');
    for (const doc of ['', '検索', ' ', '\n']) assert.ok(!new RegExp(instance.query(''), 'u').test(doc));
  });

  test(`${backend}: NUL and lone UTF-16 surrogates remain literal`, async () => {
    const instance = await initialize();
    for (const input of ['\0', 'a\0b', '\ud800', '\udc00', 'x\ud800y']) {
      const pattern = instance.query(input);
      assert.equal(typeof pattern, 'string');
      const re = new RegExp(`^(?:${pattern})$`, 'u');
      assert.ok(re.test(input), JSON.stringify(input));
      for (const other of ['', 'ab', '\ufffd', 'x\ufffdy']) assert.ok(!re.test(other), JSON.stringify(other));
    }
  });

  test(`${backend}: byte views, source mutation, and concurrent instances are independent`, async () => {
    const original = await loadDictionary();
    const padded = new Uint8Array(original.length + 17).fill(0xff);
    padded.set(original, 7);
    const view = padded.subarray(7, 7 + original.length);
    const alternate = await loadDictionary('alternate');
    const [first, second] = await Promise.all([initialize(view), initialize(alternate)]);
    const before = first.query('kensaku');
    padded.fill(0); alternate.fill(0);
    for (let i = 0; i < 4; i++) {
      const a = new RegExp(first.query('kensaku'), 'u'), b = new RegExp(second.query('kensaku'), 'u');
      assert.ok(a.test('検索')); assert.ok(!a.test('探索別館'));
      assert.ok(b.test('探索別館')); assert.ok(!b.test('検索'));
    }
    assert.equal(compareCase({ id: 'ownership', input: 'kensaku' }, before, first.query('kensaku'), ['検索', 'けんさく', 'ケンサク', '無関係']), null);
  });

  test(`${backend}: input addition and deletion do not retain previous results`, async () => {
    const instance = await initialize();
    const { sequences, documents } = await loadFixtures();
    const unique = [...new Set(sequences.flat().filter(Boolean))];
    const patterns = await referencePatterns(unique);
    const expected = new Map(unique.map((q, i) => [q, patterns[i].pattern]));
    for (const sequence of sequences) {
      for (const input of sequence) {
        const actual = instance.query(input);
        if (input === '') assert.equal(actual, '(?!)');
        else assert.equal(compareCase({ id: 'edit-sequence', input }, expected.get(input), actual, documents), null);
      }
    }
  });

  test(`${backend}: candidates are not silently capped`, async () => {
    const candidates = Array.from({ length: 512 }, (_, i) => `検証候補${String(i).padStart(4, '0')}`);
    const dictionary = compileDictionary(`てすと\t${candidates.join('\t')}\n`);
    const instance = await initialize(new Uint8Array(dictionary));
    const re = new RegExp(instance.query('tesuto'), 'u');
    for (const candidate of candidates) assert.ok(re.test(candidate), candidate);
    for (const other of ['検証候補9999', '検証候補', '無関係']) assert.ok(!re.test(other), other);
  });

  test(`${backend}: malformed dictionaries reject with InvalidDictionary`, async (t) => {
    for (const { id, bytes } of malformedDictionaries(await loadDictionary())) {
      await t.test(id, async () => {
        await assert.rejects(async () => createMigemo({ dictionary: bytes, backend }), (error) => error instanceof Error && error.code === 'InvalidDictionary');
      });
    }
    // A failed initialization must not poison later valid initialization.
    const instance = await initialize();
    assert.ok(new RegExp(instance.query('kensaku'), 'u').test('検索'));
  });
}
