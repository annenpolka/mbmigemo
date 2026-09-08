import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { CompactDictionaryBuilder } from 'jsmigemo';
import { path } from '../../scripts/lib/common.mjs';

const { createMigemo } = await import(pathToFileURL(path(
  process.env.MBMIGEMO_MODULE ?? 'packages/mbmigemo/dist/index.js',
)));
const backends = (process.env.MBMIGEMO_BACKENDS ?? 'js,wasm-gc').split(',');
assert.ok(backends.length > 0 && backends.every((backend) => ['js', 'wasm-gc'].includes(backend)));
assert.equal(new Set(backends).size, backends.length);

for (const backend of backends) {
  test(`${backend}: a valid empty compact dictionary retains literal and kana conversion`, async () => {
    // Call the pinned converter directly: TSV preparation deliberately forbids
    // empty source rows, while the binary format represents an empty map.
    const bytes = new Uint8Array(CompactDictionaryBuilder.build(new Map()));
    assert.equal(bytes.length, 54);
    const instance = await createMigemo({ dictionary: bytes, backend });
    bytes.fill(0);
    assert.equal(instance.backend, backend);
    assert.equal(instance.query(''), '(?!)');
    const re = new RegExp(instance.query('kensaku'), 'u');
    for (const value of ['kensaku', 'けんさく', 'ケンサク', 'ｹﾝｻｸ']) assert.ok(re.test(value), value);
    for (const value of ['', '検索', '無関係']) assert.ok(!re.test(value), value);
  });

  test(`${backend}: truncating the empty dictionary is an error, not an empty fallback`, async () => {
    const bytes = new Uint8Array(CompactDictionaryBuilder.build(new Map()));
    for (let length = 0; length < bytes.length; length++) {
      await assert.rejects(
        createMigemo({ dictionary: bytes.slice(0, length), backend }),
        (error) => error instanceof Error && error.code === 'InvalidDictionary',
        `truncated at ${length}`,
      );
    }
  });

  test(`${backend}: a deliberately mapped empty candidate keeps its matching semantics`, async () => {
    const bytes = new Uint8Array(CompactDictionaryBuilder.build(new Map([['a', ['']]])));
    const instance = await createMigemo({ dictionary: bytes, backend });
    assert.equal(instance.query(''), '(?!)');
    const re = new RegExp(instance.query('a'), 'u');
    for (const value of ['', 'a', '無関係']) assert.ok(re.test(value), value);
  });
}
