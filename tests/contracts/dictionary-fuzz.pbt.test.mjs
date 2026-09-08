import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fc from 'fast-check';
import { CompactDictionaryBuilder } from 'jsmigemo';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { registerProperties } from '../support/pbt.mjs';

const { createMigemo } = await import(pathToFileURL(path(
  process.env.MBMIGEMO_MODULE ?? 'packages/mbmigemo/dist/index.js',
)));
const backends = (process.env.MBMIGEMO_BACKENDS ?? 'js,wasm-gc').split(',');
assert.ok(backends.length > 0 && backends.every((backend) => ['js', 'wasm-gc'].includes(backend)));
assert.equal(new Set(backends).size, backends.length);

const fixtures = new Map([
  ['tiny', await loadDictionary('tiny')],
  ['alternate', await loadDictionary('alternate')],
  ['empty', new Uint8Array(CompactDictionaryBuilder.build(new Map()))],
]);
const queries = ['', 'a', 'kensaku', '\0', '\ud800', '\udc00', '𠮷', '[a]+\n'];

async function verifyBytes(bytes) {
  const outcomes = await Promise.all(backends.map(async (backend) => {
    let instance;
    try {
      instance = await createMigemo({ dictionary: bytes, backend });
    } catch (error) {
      // UnsupportedBackend, InitializationFailed, crashes, and unclassified
      // exceptions are not acceptable responses to malformed dictionary bytes.
      assert.ok(error instanceof Error, backend);
      assert.equal(error.code, 'InvalidDictionary', backend);
      return { valid: false };
    }
    assert.equal(instance.backend, backend);
    const patterns = queries.map((input) => {
      const pattern = instance.query(input);
      assert.equal(typeof pattern, 'string', backend);
      assert.doesNotThrow(() => new RegExp(pattern, 'u'), backend);
      if (input === '') assert.equal(pattern, '(?!)', backend);
      return pattern;
    });
    return { valid: true, patterns };
  }));
  for (let i = 1; i < outcomes.length; i++) {
    assert.deepEqual(outcomes[i], outcomes[0], `${backends[i]} and ${backends[0]} disagree`);
  }
}

const mutatedDictionary = fc.tuple(
  fc.constantFrom(...fixtures.keys()),
  fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { minLength: 1, maxLength: 8 }),
).map(([fixture, edits]) => {
  const bytes = new Uint8Array(fixtures.get(fixture));
  for (const [position, value] of edits) bytes[position % bytes.length] = value;
  // Include the actual tested bytes in the generated argument, so the failure
  // receipt contains the minimized bytes as well as the fixture and edit trace.
  return { fixture, edits, bytes };
});

registerProperties({
  'api-dictionary-arbitrary-bytes': fc.asyncProperty(
    fc.uint8Array({ maxLength: 1024 }),
    verifyBytes,
  ),

  'api-dictionary-byte-mutations': fc.asyncProperty(mutatedDictionary, async ({ bytes }) => {
    // A changed edge, mapping, or unused padding byte can still be valid. Check
    // consistent validation and safe query behavior instead of rejecting every mutation.
    await verifyBytes(bytes);
  }),
});
